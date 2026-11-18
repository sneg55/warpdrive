import { eq } from "drizzle-orm";
import type { WebSocket } from "ws";
import { parseChannel } from "@/constants/wsChannels";
import { WS_AUTH_TIMEOUT_MS, WS_CLOSE_AUTH_TIMEOUT, WS_HEARTBEAT_MS } from "@/constants/wsLimits";
import type { Db } from "@/db/client";
import { users, visibilityGroupMembers } from "@/db/schema";
import { loadLiveSessionById } from "@/features/auth/session";
import {
  authorizeDeal,
  authorizeSubscribe,
  consumeTicketAndBind,
  type WsConnection,
} from "./authorize";
import type { ClientEvent, PublishedEvent } from "./payload";
import { isPresenceChannel, type PresenceHub } from "./presenceHub";
import type { Relay, RelayListener } from "./relay";

export interface WsServerDeps {
  db: Db;
  relay: Relay;
  heartbeatMs?: number;
  authTimeoutMs?: number;
  maxPayloadBytes?: number;
  maxConnections?: number;
}

function dealIdForFanout(channel: string, event: PublishedEvent): string | null {
  const parsed = parseChannel(channel);
  if (parsed === null) return null;
  if (parsed.family !== "deal" && parsed.family !== "pipeline") return null;
  const data = event.data as { dealId?: unknown };
  return typeof data.dealId === "string" ? data.dealId : null;
}

type WsMsg = { kind?: string; ticket?: string; channel?: string };

let nextConnId = 0;

export class SocketSession {
  private conn: WsConnection | null = null;
  private readonly subs = new Map<string, RelayListener>();
  private readonly nextSeqByChannel = new Map<string, number>();
  private sendChain: Promise<void> = Promise.resolve();
  private readonly connId = `c${nextConnId++}`;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private authDeadline: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly deps: WsServerDeps,
    private readonly hub: PresenceHub,
  ) {
    this.authDeadline = setTimeout(() => {
      if (this.conn === null) this.socket.close(WS_CLOSE_AUTH_TIMEOUT);
    }, this.deps.authTimeoutMs ?? WS_AUTH_TIMEOUT_MS);
    this.authDeadline.unref();
  }

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
    this.clearAuthDeadline();
    this.startHeartbeat();
    this.socket.send(JSON.stringify({ kind: "auth_ok" }));
  }

  private clearAuthDeadline(): void {
    if (this.authDeadline !== null) {
      clearTimeout(this.authDeadline);
      this.authDeadline = null;
    }
  }

  private startHeartbeat(): void {
    const ms = this.deps.heartbeatMs ?? WS_HEARTBEAT_MS;
    this.heartbeat = setInterval(() => {
      void this.checkLiveness();
    }, ms);
  }

  private async checkLiveness(): Promise<void> {
    const conn = this.conn;
    if (conn === null) return;
    try {
      const live = await loadLiveSessionById(
        this.deps.db,
        conn.sessionId,
        AbortSignal.timeout(5000),
      );
      if (!live.ok) {
        this.clearHeartbeat();
        this.socket.close(4401);
        return;
      }
      const refreshed = await loadConn(this.deps.db, conn.userId, conn.sessionId);
      if (refreshed.ok) this.conn = refreshed.value;
    } catch (e) {
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
      this.sendChain = this.sendChain
        .then(() => this.deliver(channel, event))
        .catch((e: unknown) => {
          console.warn("ws deliver failed; dropping event", e);
        });
    };
    this.subs.set(channel, listener);
    await this.deps.relay.subscribe(channel, listener);

    if (isPresenceChannel(channel)) {
      this.hub.join(channel, this.connId, conn.userId, conn.name, (json) => this.socket.send(json));
    }

    this.socket.send(JSON.stringify({ kind: "subscribed", channel }));
  }

  private async deliver(channel: string, event: PublishedEvent): Promise<void> {
    const conn = this.conn;
    if (conn === null) return;
    const dealId = dealIdForFanout(channel, event);
    if (dealId !== null) {
      const authz = await authorizeDeal(this.deps.db, conn, dealId, AbortSignal.timeout(5000));
      if (!authz.ok) return;
    }
    const seq = this.nextSeqByChannel.get(channel) ?? 0;
    this.nextSeqByChannel.set(channel, seq + 1);
    const frame: ClientEvent = { ...event, seq };
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
    this.clearAuthDeadline();
    this.clearHeartbeat();
    for (const [channel, listener] of this.subs) {
      await this.deps.relay.unsubscribe(channel, listener);
    }
    this.subs.clear();
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
