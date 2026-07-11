import { describe, expect, test } from "vitest";
import {
  authed,
  closeCode,
  connect,
  nextMessage,
  opened,
  otherUserId,
  publish,
  sessionId,
  userId,
} from "./testHarness.test";
import { mintTicket } from "./ticket";

describe("ws server dispatch + relay", () => {
  test("no/invalid ticket is rejected with close 4401", async () => {
    const ws = connect();
    await opened(ws);
    ws.send(JSON.stringify({ kind: "auth", ticket: "garbage" }));
    expect(await closeCode(ws)).toBe(4401);
  });

  test("valid ticket -> auth_ok; replay of same ticket is rejected", async () => {
    const ws = connect();
    await opened(ws);
    const token = await mintTicket({ userId, sessionId });
    ws.send(JSON.stringify({ kind: "auth", ticket: token }));
    await nextMessage(ws, "auth_ok");

    const ws2 = connect();
    await opened(ws2);
    ws2.send(JSON.stringify({ kind: "auth", ticket: token }));
    expect(await closeCode(ws2)).toBe(4401);
  });

  test("subscribe to own user channel succeeds, another user's is denied", async () => {
    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${userId}` }));
    const ok = await nextMessage(ws, "subscribed");
    expect(ok.channel).toBe(`user:${userId}`);

    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${otherUserId}` }));
    const denied = await nextMessage(ws, "error");
    expect(denied.channel).toBe(`user:${otherUserId}`);
  });

  test("pg_notify to a subscribed+authorized channel is delivered", async () => {
    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${userId}` }));
    await nextMessage(ws, "subscribed");

    const eventP = nextMessage(ws, "event");
    await publish(`user:${userId}`);
    const event = await eventP;
    const inner = event.event as { channel: string; type: string; seq: number };
    expect(inner.channel).toBe(`user:${userId}`);
    expect(inner.type).toBe("note_added");
    // The WS server stamps a per-socket seq (the published payload carries none).
    expect(inner.seq).toBe(0);
  });

  test("the WS server stamps an incrementing per-socket seq", async () => {
    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${userId}` }));
    await nextMessage(ws, "subscribed");

    // Collect the seq of the first two delivered events on this socket.
    const seqs: number[] = [];
    const got = new Promise<void>((resolve) => {
      ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString()) as { kind?: string; event?: { seq: number } };
        if (msg.kind === "event" && msg.event !== undefined) {
          seqs.push(msg.event.seq);
          if (seqs.length === 2) resolve();
        }
      });
    });

    await publish(`user:${userId}`);
    await publish(`user:${userId}`);
    await got;

    expect(seqs).toEqual([0, 1]);
  });

  test("pg_notify to a channel the client is NOT subscribed to is not delivered", async () => {
    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${userId}` }));
    await nextMessage(ws, "subscribed");

    let delivered = false;
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as { kind?: string };
      if (msg.kind === "event") delivered = true;
    });
    // Notify a different (unsubscribed) channel; relay has no LISTEN for it.
    await publish(`user:${otherUserId}`);
    await new Promise((r) => setTimeout(r, 300));
    expect(delivered).toBe(false);
  });

  test("a client publish/notify frame causes NO relay (kind no longer exists)", async () => {
    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${userId}` }));
    await nextMessage(ws, "subscribed");

    let delivered = false;
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as { kind?: string };
      if (msg.kind === "event") delivered = true;
    });
    // Forge a client event: this kind is unhandled, must not fan out.
    ws.send(
      JSON.stringify({
        kind: "notify",
        channel: `user:${userId}`,
        payload: {
          v: 1,
          channel: `user:${userId}`,
          ts: new Date().toISOString(),
          actorId: null,
          type: "note_added",
          data: { noteId: "forged", dealId: "d1" },
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(delivered).toBe(false);
  });

  test("unsubscribe stops delivery on that channel", async () => {
    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `user:${userId}` }));
    await nextMessage(ws, "subscribed");
    ws.send(JSON.stringify({ kind: "unsubscribe", channel: `user:${userId}` }));
    await nextMessage(ws, "unsubscribed");

    let delivered = false;
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as { kind?: string };
      if (msg.kind === "event") delivered = true;
    });
    await publish(`user:${userId}`);
    await new Promise((r) => setTimeout(r, 300));
    expect(delivered).toBe(false);
  });
});
