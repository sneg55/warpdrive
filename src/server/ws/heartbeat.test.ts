// Heartbeat liveness re-validation (ops spec A1 step 4, Codex finding F4). The socket's
// isActive/groupIds are captured once at auth; if the session is revoked or the user is
// deactivated AFTER auth, a periodic heartbeat must close the socket with 4401. Uses a
// dedicated server with a short heartbeat interval (the shared harness uses the default).

import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import {
  deals,
  pipelines,
  sessions,
  stages,
  users,
  visibilityGroupMembers,
  visibilityGroups,
} from "@/db/schema";
import { sessionFixture } from "@/features/auth/session.test-helpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { createRelay, type Relay } from "./relay";
import { startWsServer } from "./server";
import { mintTicket } from "./ticket";

let h: TestDb;
let listenClient: Client;
let relay: Relay;
let server: ReturnType<typeof startWsServer>;
let port: number;
let userId: string;
let sessionId: string;
const HEARTBEAT_MS = 120;

beforeAll(async () => {
  h = await makeTestDb();
  listenClient = new Client({ connectionString: h.url });
  await listenClient.connect();
  relay = createRelay(listenClient);
  server = startWsServer(0, { db: h.db, relay, heartbeatMs: HEARTBEAT_MS });
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await relay.close();
  await h.close();
});

beforeEach(async () => {
  await h.db.execute(
    sql`TRUNCATE ws_tickets, sessions, users, permission_sets RESTART IDENTITY CASCADE`,
  );
  const [u] = await h.db
    .insert(users)
    .values({ email: "hb@example.com", name: "HB", googleSub: "g-hb" })
    .returning();
  userId = u!.id;
  const [s] = await h.db
    .insert(sessions)
    .values(sessionFixture({ userId, expiresAt: new Date(Date.now() + 3_600_000) }))
    .returning();
  sessionId = s!.id;
});

async function authed(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  const token = await mintTicket({ userId, sessionId });
  ws.send(JSON.stringify({ kind: "auth", ticket: token }));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth timeout")), 4000);
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as { kind?: string };
      if (msg.kind === "auth_ok") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return ws;
}

function closeCode(ws: WebSocket, ms = 4000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for close")), ms);
    ws.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test("closes with 4401 after the session is revoked (heartbeat)", async () => {
  const ws = await authed();
  // Revoke the session AFTER auth; the heartbeat should notice and close the socket.
  await h.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  expect(await closeCode(ws)).toBe(4401);
});

test("closes with 4401 after the user is deactivated (heartbeat)", async () => {
  const ws = await authed();
  await h.db.update(users).set({ isActive: false }).where(eq(users.id, userId));
  expect(await closeCode(ws)).toBe(4401);
});

test("stays open while the session remains live", async () => {
  const ws = await authed();
  let closed = false;
  ws.on("close", () => {
    closed = true;
  });
  // Wait several heartbeat ticks; nothing revoked, so the socket must stay open.
  await new Promise((r) => setTimeout(r, HEARTBEAT_MS * 4));
  expect(closed).toBe(false);
  ws.close();
});

async function publishDealMoved(channel: string, dealId: string): Promise<void> {
  const event = {
    v: 1,
    channel,
    ts: new Date().toISOString(),
    actorId: null,
    type: "deal_moved",
    data: { dealId, toStageId: "s" },
  };
  await h.db.execute(sql`SELECT pg_notify(${channel}, ${JSON.stringify(event)})`);
}

// F8: authority (group membership) is captured at auth; the heartbeat must rehydrate it so
// per-recipient fan-out stops delivering restricted-pipeline events after the user is
// removed from the gating group, without waiting for a reconnect.
test("stops delivering restricted-pipeline events after group removal (heartbeat rehydrate)", async () => {
  const [g] = await h.db.insert(visibilityGroups).values({ name: "Gate" }).returning();
  await h.db.insert(visibilityGroupMembers).values({ groupId: g!.id, userId });
  const [p] = await h.db
    .insert(pipelines)
    .values({ name: "Restricted", visibilityGroupId: g!.id })
    .returning();
  const [stage] = await h.db
    .insert(stages)
    .values({ name: "S1", pipelineId: p!.id, order: 0 })
    .returning();
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "d",
      status: "open",
      pipelineId: p!.id,
      stageId: stage!.id,
      boardPosition: "1000",
      ownerId: userId,
      visibilityLevel: "all",
    })
    .returning();

  const ws = await authed();
  const received: unknown[] = [];
  ws.on("message", (raw: Buffer) => {
    const m = JSON.parse(raw.toString()) as { kind?: string; event?: unknown };
    if (m.kind === "event") received.push(m.event);
  });
  const channel = `pipeline:${p!.id}`;
  ws.send(JSON.stringify({ kind: "subscribe", channel }));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("subscribe timeout")), 4000);
    ws.on("message", (raw: Buffer) => {
      const m = JSON.parse(raw.toString()) as { kind?: string };
      if (m.kind === "subscribed") {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  // Member: the event is delivered.
  await publishDealMoved(channel, d!.id);
  await new Promise((r) => setTimeout(r, 300));
  expect(received.length).toBe(1);

  // Remove from the group and let the heartbeat rehydrate the connection's authority.
  await h.db.delete(visibilityGroupMembers).where(eq(visibilityGroupMembers.userId, userId));
  await new Promise((r) => setTimeout(r, HEARTBEAT_MS * 4));

  // No longer a member: the restricted-pipeline event is dropped for this socket.
  await publishDealMoved(channel, d!.id);
  await new Promise((r) => setTimeout(r, 300));
  expect(received.length).toBe(1);
  ws.close();
});
