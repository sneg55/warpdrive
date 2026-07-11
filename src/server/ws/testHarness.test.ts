// Shared integration test harness for WS server tests.
// Manages a single real Postgres + real ws server instance.
// Import into each *integration* test file; vitest --no-file-parallelism keeps
// them from racing over the same port.

import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { sessions, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { createRelay, type Relay } from "./relay";
import { startWsServer } from "./server";
import { mintTicket } from "./ticket";

export let h: TestDb;
export let port: number;
let listenClient: Client;
let relay: Relay;
let server: ReturnType<typeof startWsServer>;

export let userId: string;
export let sessionId: string;
export let otherUserId: string;

beforeAll(async () => {
  h = await makeTestDb();
  listenClient = new Client({ connectionString: h.url });
  await listenClient.connect();
  relay = createRelay(listenClient);
  server = startWsServer(0, { db: h.db, relay });
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
    sql`TRUNCATE ws_tickets, sessions, users, permission_sets, channel_versions RESTART IDENTITY CASCADE`,
  );
  const [u] = await h.db
    .insert(users)
    .values({ email: "w@example.com", name: "W", googleSub: "g-w" })
    .returning();
  userId = u!.id;
  const [o] = await h.db
    .insert(users)
    .values({ email: "o@example.com", name: "O", googleSub: "g-o" })
    .returning();
  otherUserId = o!.id;
  const [s] = await h.db
    .insert(sessions)
    .values({ userId, expiresAt: new Date(Date.now() + 3_600_000) })
    .returning();
  sessionId = s!.id;
});

export const openSockets: WebSocket[] = [];

afterEach(() => {
  for (const ws of openSockets) ws.close();
  openSockets.length = 0;
});

export function connect(): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  openSockets.push(ws);
  return ws;
}

export function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

// Resolve with the next message whose kind matches; reject on timeout/close.
export function nextMessage(
  ws: WebSocket,
  kind: string,
  ms = 4000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${kind}`)), ms);
    const onMsg = (raw: Buffer): void => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (msg.kind === kind) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

export function closeCode(ws: WebSocket, ms = 4000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for close")), ms);
    ws.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

// Mirror publishEvent's wire format: pg_notify(channel, JSON.stringify(event)).
// The published payload carries NO seq; the WS server stamps a per-socket seq.
export async function publish(channel: string, type = "note_added"): Promise<void> {
  const event = {
    v: 1,
    channel,
    ts: new Date().toISOString(),
    actorId: null,
    type,
    data: { noteId: "n1", dealId: "d1" },
  };
  await h.db.execute(sql`SELECT pg_notify(${channel}, ${JSON.stringify(event)})`);
}

export async function authed(): Promise<WebSocket> {
  const ws = connect();
  await opened(ws);
  const token = await mintTicket({ userId, sessionId });
  ws.send(JSON.stringify({ kind: "auth", ticket: token }));
  await nextMessage(ws, "auth_ok");
  return ws;
}
