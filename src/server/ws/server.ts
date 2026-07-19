import { eq } from "drizzle-orm";
import type { RawData } from "ws";
import { type WebSocket, WebSocketServer } from "ws";
import { parseChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { users, visibilityGroupMembers } from "@/db/schema";
import { loadLiveSession } from "@/features/auth/session";
import {
  authorizeDeal,
  authorizeSubscribe,
  consumeTicketAndBind,
  type WsConnection,
} from "./authorize";
import type { ClientEvent, PublishedEvent } from "./payload";
import { isPresenceChannel, PresenceHub } from "./presenceHub";
import type { Relay, RelayListener } from "./relay";

export interface WsServerDeps {
  db: Db;
  relay: Relay;
  // How often (ms) to re-validate that the bound session is still live AND the user is
  // still active (ops spec A1 step 4). Default 5 min; tests inject a short interval.
  heartbeatMs?: number;
}

// Default heartbeat cadence (ops spec A1 step 4: "periodic heartbeat (every 5 min)").
const DEFAULT_HEARTBEAT_MS = 5 * 60 * 1000;

// Extract the dealId a fan-out event names, but ONLY on deal/pipeline channels where a
// per-recipient canSee(deal) re-check applies (ops spec A3). user: channels are already
// self-scoped and their events (notification/mention/email) are not deal-metadata leaks.
function dealIdForFanout(channel: string, event: PublishedEvent): string | null {
  const parsed = parseChannel(channel);
  if (parsed === null) return null;
  if (parsed.family !== "deal" && parsed.family !== "pipeline") return null;
  const data = event.data as { dealId?: unknown };
  return typeof data.dealId === "string" ? data.dealId : null;
}

// Inbound client frames are ONLY auth | subscribe | unsubscribe. There is no
// client publish path: relayed events originate from the server-owned pg LISTEN
// loop (relay.ts), never from a socket (ops spec A3 / A1 step 3).
type WsMsg = { kind?: string; ticket?: string; channel?: string };

// Decode ws RawData (Buffer | ArrayBuffer | Buffer[]) to a UTF-8 string.
function rawToUtf8(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return Buffer.concat(raw).toString("utf8");
}

// Module-level counter for deterministic per-socket connIds.
// Safe: JS is single-threaded; each startWsServer call creates its own PresenceHub
// so connIds only need to be unique within a server's lifetime.
let nextConnId = 0;

// Boots the standalone WS process (Compose `ws` service). Auth via the first `auth`
// frame (ops spec A1); subscribes authorized per A2; server-trusted NOTIFY relayed
// per A3. Deps (db + relay) are injected so tests run against a real Postgres
// container without mocking the database.
export function startWsServer(port: number, deps: WsServerDeps): WebSocketServer {
  // One PresenceHub per server instance keeps test runs isolated.
  const presenceHub = new PresenceHub();

  const wss = new WebSocketServer({ port });
  wss.on("connection", (socket: WebSocket) => {
    const session = new SocketSession(socket, deps, presenceHub);
    socket.on("message", (raw) => {
      void session.dispatch(rawToUtf8(raw));
    });
    socket.on("close", () => {
      void session.teardown();
    });
  });
  return wss;
}

// Per-socket state + handlers. `conn` is null until the auth frame succeeds.
// `subs` maps each subscribed channel to its relay listener so we can deregister
// on unsubscribe/close.
class SocketSession {
  private conn: WsConnection | null = null;
  private readonly subs = new Map<string, RelayListener>();
  // Per-CHANNEL delivery counter (ops spec A4), so one socket can carry several channels and each
  // client handler still sees a gap-free seq for its own channel (the client multiplexes a single
  // socket across board/presence/notifications/inbox/import). Stamped onto every relay event this
  // socket actually delivers; presence frames NEVER advance it.
  // CRITICAL: only advance when a relay event is delivered. The per-recipient canSee filter
  // (deliver()) must NOT increment the counter for suppressed events (no telltale gap).
  private readonly nextSeqByChannel = new Map<string, number>();
  // Per-socket delivery chain: relay events fire synchronously but the per-recipient
  // canSee re-check is async (a live DB read). Chaining serializes deliveries so seq is
  // assigned in arrival order and a suppressed event never reorders or skips a seq.
  private sendChain: Promise<void> = Promise.resolve();
  // Stable id for this socket within the PresenceHub.
  private readonly connId = `c${nextConnId++}`;
  // Periodic liveness re-validation timer (ops spec A1 step 4). Null until auth succeeds.
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly deps: WsServerDeps,
    private readonly hub: PresenceHub,
  ) {}

  async dispatch(text: string): Promise<void> {
    let msg: WsMsg;
    try {
      msg = JSON.parse(text) as WsMsg;
    } catch {
      this.socket.close(4400);
      return;
    }
    if (msg.kind === "auth" && typeof msg.ticket === "string") {
      await this.handleAuth(msg.ticket);
      return;
    }
    if (this.conn === null) {
      this.socket.close(4401);
      return;
    }
    if (msg.kind === "subscribe" && typeof msg.channel === "string") {
      await this.handleSubscribe(this.conn, msg.channel);
      return;
    }
    if (msg.kind === "unsubscribe" && typeof msg.channel === "string") {
      await this.handleUnsubscribe(msg.channel);
    }
  }

  private async handleAuth(ticket: string): Promise<void> {
    const bound = await consumeTicketAndBind(this.deps.db, ticket, AbortSignal.timeout(5000));
    if (!bound.ok) {
      this.socket.close(4401);
      return;
    }
    const loaded = await loadConn(this.deps.db, bound.value.userId, bound.value.sessionId);
    if (!loaded.ok) {
      this.socket.close(4401);
      return;
    }
    this.conn = loaded.value;
    this.startHeartbeat();
    this.socket.send(JSON.stringify({ kind: "auth_ok" }));
  }

  // A1 step 4: periodically re-validate that the bound session is still live AND the
  // user is still active. loadLiveSession checks both (revoked_at, expiry, is_active), so
  // a deactivated user or revoked session closes the socket with 4401 within one tick,
  // even though groupIds/isActive were captured once at auth time.
  private startHeartbeat(): void {
    const ms = this.deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this.heartbeat = setInterval(() => {
      void this.checkLiveness();
    }, ms);
  }

  private async checkLiveness(): Promise<void> {
    const conn = this.conn;
    if (conn === null) return;
    try {
      const live = await loadLiveSession(this.deps.db, conn.sessionId, AbortSignal.timeout(5000));
      if (!live.ok) {
        this.clearHeartbeat();
        this.socket.close(4401);
        return;
      }
      // Rehydrate authority (isAdmin, isActive, groupIds) so a group removal or admin
      // demotion takes effect on the next heartbeat rather than only on reconnect (F8). The
      // per-recipient fan-out re-check (deliver) reads this refreshed conn.
      const refreshed = await loadConn(this.deps.db, conn.userId, conn.sessionId);
      if (refreshed.ok) this.conn = refreshed.value;
    } catch (e) {
      // A transient DB error (or a pool closing during teardown) must not become an
      // unhandled rejection. Leave the socket as-is; the next heartbeat re-checks.
      console.warn("ws heartbeat check failed; will retry next tick", e);
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private async handleSubscribe(conn: WsConnection, channel: string): Promise<void> {
    const authz = await authorizeSubscribe(this.deps.db, conn, channel, AbortSignal.timeout(5000));
    if (!authz.ok) {
      this.socket.send(JSON.stringify({ kind: "error", channel }));
      return;
    }
    if (this.subs.has(channel)) {
      this.socket.send(JSON.stringify({ kind: "subscribed", channel }));
      return;
    }
    const listener: RelayListener = (event) => {
      // Enqueue on the per-socket chain: delivery may await a live canSee re-check.
      // A failed re-check (DB error / abort) drops the event rather than reject the chain.
      // deliver() reads this.conn (refreshed by the heartbeat), NOT the subscribe-time
      // snapshot, so revoked group/admin authority stops delivery (F8).
      this.sendChain = this.sendChain
        .then(() => this.deliver(channel, event))
        .catch((e: unknown) => {
          console.warn("ws deliver failed; dropping event", e);
        });
    };
    this.subs.set(channel, listener);
    await this.deps.relay.subscribe(channel, listener);

    // Register presence AFTER relay subscribe so the socket is fully set up.
    if (isPresenceChannel(channel)) {
      this.hub.join(channel, this.connId, conn.userId, conn.name, (json) => this.socket.send(json));
    }

    this.socket.send(JSON.stringify({ kind: "subscribed", channel }));
  }

  // Deliver one relay event to this socket, applying the per-recipient canSee(deal)
  // re-check (ops spec A3). A deal the recipient can no longer see is dropped ENTIRELY:
  // no payload is sent and nextSeq is NOT advanced, so a suppressed event is invisible
  // (no telltale seq gap). Non-deal events (user-channel notification/mention/email) pass
  // straight through with the next seq.
  private async deliver(channel: string, event: PublishedEvent): Promise<void> {
    // Use the CURRENT connection authority (the heartbeat rehydrates admin/groups), so a
    // demoted or group-removed user stops receiving restricted events (F8).
    const conn = this.conn;
    if (conn === null) return;
    const dealId = dealIdForFanout(channel, event);
    if (dealId !== null) {
      const authz = await authorizeDeal(this.deps.db, conn, dealId, AbortSignal.timeout(5000));
      if (!authz.ok) return; // drop: no payload, no seq advance
    }
    const seq = this.nextSeqByChannel.get(channel) ?? 0;
    this.nextSeqByChannel.set(channel, seq + 1);
    const frame: ClientEvent = { ...event, seq };
    // channel tags the frame so a multiplexed client routes it to the right handler; existing
    // single-channel clients ignore the extra field.
    this.socket.send(JSON.stringify({ kind: "event", channel, event: frame }));
  }

  private async handleUnsubscribe(channel: string): Promise<void> {
    const listener = this.subs.get(channel);
    if (listener === undefined) return;
    this.subs.delete(channel);
    await this.deps.relay.unsubscribe(channel, listener);

    if (isPresenceChannel(channel)) {
      this.hub.leave(channel, this.connId);
    }

    this.socket.send(JSON.stringify({ kind: "unsubscribed", channel }));
  }

  async teardown(): Promise<void> {
    this.clearHeartbeat();
    for (const [channel, listener] of this.subs) {
      await this.deps.relay.unsubscribe(channel, listener);
    }
    this.subs.clear();
    // Remove this connection from all presence channels and broadcast to survivors.
    this.hub.dropConnection(this.connId);
  }
}

type LoadConnResult = { ok: true; value: WsConnection } | { ok: false };

async function loadConn(dbConn: Db, userId: string, sessionId: string): Promise<LoadConnResult> {
  const [u] = await dbConn.select().from(users).where(eq(users.id, userId)).limit(1);
  if (u === undefined) return { ok: false };

  const groupRows = await dbConn
    .select({ groupId: visibilityGroupMembers.groupId })
    .from(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.userId, userId));

  return {
    ok: true,
    value: {
      userId,
      sessionId,
      name: u.name,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
      groupIds: groupRows.map((r) => r.groupId),
    },
  };
}
