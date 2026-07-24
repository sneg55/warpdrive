// Resource bounds on the WS listener. Separate from server.test.ts because these need their own
// server instance with tight limits injected, rather than the shared harness one.
//
// /_ws is publicly reachable through Caddy and accepts a TCP connection from anyone. Before this,
// a socket that connected and then simply said nothing was never closed (dispatch only closes on
// a non-auth frame, and a client that sends no frame at all never reaches dispatch), no cap
// existed on how many such sockets one peer could hold, and the `ws` default maxPayload of 100 MB
// applied even though every legitimate inbound frame is a few hundred bytes of JSON.

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
    // Says nothing at all: the case dispatch() can never see, because dispatch only runs on a
    // received message.
    expect(await closeCode(ws)).toBe(4408);
  });

  test("does not close a socket that fails auth loudly before the deadline", async () => {
    const ws = connect();
    await opened(ws);
    ws.send(JSON.stringify({ kind: "auth", ticket: "garbage" }));
    // 4401 (auth rejected), not 4408 (never spoke): the deadline must not mask the real reason.
    expect(await closeCode(ws)).toBe(4401);
  });
});

describe("frame size cap", () => {
  test("drops a socket that sends a frame larger than any legitimate message", async () => {
    const ws = connect();
    await opened(ws);
    // The server's rejection reaches this client as an error event as well as a close. Expected
    // here, so it is handled; an unhandled 'error' on a ws client is an uncaught exception.
    ws.on("error", () => {});
    ws.send(JSON.stringify({ kind: "subscribe", channel: "x".repeat(MAX_PAYLOAD_BYTES) }));
    // 1009 is the protocol's own "message too big", emitted by ws when maxPayload is exceeded.
    expect(await closeCode(ws)).toBe(1009);
  });

  // The same rejection raises an 'error' event on the SERVER side socket. A ws socket with no
  // error listener rethrows, which in the standalone ws process is an uncaught exception that
  // takes the whole listener down. Capping the payload is what makes that reachable on demand by
  // any unauthenticated peer, so the handler has to exist for the cap to be an improvement.
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
    // 1013 is "try again later", the honest answer: this is capacity, not a client error.
    expect(await closeCode(overflow)).toBe(1013);

    for (const ws of held) ws.close();
  });

  // The capacity branch closes the socket and returns. That socket is still live during its close
  // handshake, and a hostile overflow peer can push an oversize frame into it: ws then emits
  // 'error' on the SERVER-side socket. If the error handler is only installed after the capacity
  // return (the non-overflow path), that error is unhandled and kills the standalone ws process.
  // So the very endpoint whose job is to shed load becomes a one-frame remote kill switch.
  test("survives an oversize frame from an over-capacity peer", async () => {
    const held: WebSocket[] = [];
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const ws = connect();
      await opened(ws);
      held.push(ws);
    }

    const offender = connect();
    offender.on("error", () => {});
    // Push the oversize frame the instant the socket opens, while the capacity close handshake is
    // still in flight, so it lands on the server socket before it is torn down.
    offender.on("open", () => {
      offender.send(JSON.stringify({ kind: "subscribe", channel: "x".repeat(MAX_PAYLOAD_BYTES) }));
    });
    await closeCode(offender);

    // Free a slot, then prove the listener is still alive and accepting.
    held.pop()?.close();
    const survivor = connect();
    await expect(opened(survivor)).resolves.toBeUndefined();

    survivor.close();
    for (const ws of held) ws.close();
  });
});
