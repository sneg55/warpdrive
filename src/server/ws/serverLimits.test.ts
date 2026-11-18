import type { AddressInfo } from "node:net";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { makeTestDb, type TestDb } from "@/test/db";
import { createRelay, type Relay } from "./relay";
import { startWsServer } from "./server";

const AUTH_TIMEOUT_MS = 300;
const MAX_CONNECTIONS = 3;
const MAX_PAYLOAD_BYTES = 1024;

let h: TestDb;
let listenClient: Client;
let relay: Relay;
let server: ReturnType<typeof startWsServer>;
let port: number;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  h = await makeTestDb();
  listenClient = new Client({ connectionString: h.url });
  await listenClient.connect();
  relay = createRelay(listenClient);
  server = startWsServer(0, {
    db: h.db,
    relay,
    authTimeoutMs: AUTH_TIMEOUT_MS,
    maxConnections: MAX_CONNECTIONS,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
  });
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const ws of sockets) ws.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await relay.close();
  await h.close();
});

function connect(): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  return ws;
}

function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

function closeCode(ws: WebSocket, ms = 4_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for close")), ms);
    ws.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("unauthenticated socket deadline", () => {
  test("closes a socket that connects and never sends an auth frame", async () => {
    const ws = connect();
    await opened(ws);
    expect(await closeCode(ws)).toBe(4408);
  });

  test("does not close a socket that fails auth loudly before the deadline", async () => {
    const ws = connect();
    await opened(ws);
    ws.send(JSON.stringify({ kind: "auth", ticket: "garbage" }));
    expect(await closeCode(ws)).toBe(4401);
  });
});

describe("frame size cap", () => {
  test("drops a socket that sends a frame larger than any legitimate message", async () => {
    const ws = connect();
    await opened(ws);
    ws.on("error", () => {});
    ws.send(JSON.stringify({ kind: "subscribe", channel: "x".repeat(MAX_PAYLOAD_BYTES) }));
    expect(await closeCode(ws)).toBe(1009);
  });

  test("survives the resulting socket error and keeps serving other clients", async () => {
    const offender = connect();
    await opened(offender);
    offender.on("error", () => {});
    offender.send(JSON.stringify({ kind: "subscribe", channel: "x".repeat(MAX_PAYLOAD_BYTES) }));
    await closeCode(offender);

    const survivor = connect();
    await expect(opened(survivor)).resolves.toBeUndefined();
    survivor.close();
  });
});

describe("connection cap", () => {
  test("refuses connections past the cap instead of accepting unbounded sockets", async () => {
    const held: WebSocket[] = [];
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const ws = connect();
      await opened(ws);
      held.push(ws);
    }

    const overflow = connect();
    expect(await closeCode(overflow)).toBe(1013);

    for (const ws of held) ws.close();
  });

  test("survives an oversize frame from an over-capacity peer", async () => {
    const held: WebSocket[] = [];
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const ws = connect();
      await opened(ws);
      held.push(ws);
    }

    const offender = connect();
    offender.on("error", () => {});
    offender.on("open", () => {
      offender.send(JSON.stringify({ kind: "subscribe", channel: "x".repeat(MAX_PAYLOAD_BYTES) }));
    });
    await closeCode(offender);

    held.pop()?.close();
    const survivor = connect();
    await expect(opened(survivor)).resolves.toBeUndefined();

    survivor.close();
    for (const ws of held) ws.close();
  });
});
