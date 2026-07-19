import { describe, expect, it, vi } from "vitest";
import { type WsFrame, WsMultiplexer } from "./wsMultiplexer";

// Minimal WebSocket stand-in the multiplexer drives via onopen/onmessage/onclose.
class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];
  closed = false;
  send(s: string): void {
    this.sent.push(s);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  open(): void {
    this.onopen?.();
  }
  deliver(frame: object): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  sentKinds(): string[] {
    return this.sent.map((s) => (JSON.parse(s) as { kind: string }).kind);
  }
  subscribedChannels(): string[] {
    return this.sent
      .map((s) => JSON.parse(s) as { kind: string; channel?: string })
      .filter((m) => m.kind === "subscribe")
      .map((m) => m.channel ?? "");
  }
}

function setup(url = "ws://x") {
  const sockets: FakeSocket[] = [];
  const makeSocket = (): WebSocket => {
    const s = new FakeSocket();
    sockets.push(s);
    return s as unknown as WebSocket;
  };
  const mintTicket = vi.fn(() => Promise.resolve("ticket-1"));
  const mux = new WsMultiplexer(url, mintTicket, makeSocket);
  return { mux, sockets, mintTicket };
}

// Await the microtask where connect()'s awaited mintTicket resolves and the socket is created.
const flush = (): Promise<void> => Promise.resolve().then(() => undefined);

describe("WsMultiplexer", () => {
  it("mints one ticket and opens one socket for multiple channels", async () => {
    const { mux, sockets, mintTicket } = setup();
    mux.subscribe("pipeline:p1", vi.fn());
    mux.subscribe("user:u1", vi.fn());
    await flush();
    expect(mintTicket).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
  });

  it("auths then subscribes every live channel on auth_ok", async () => {
    const { mux, sockets } = setup();
    mux.subscribe("pipeline:p1", vi.fn());
    mux.subscribe("user:u1", vi.fn());
    await flush();
    const sock = sockets[0]!;
    sock.open();
    expect(sock.sentKinds()[0]).toBe("auth");
    sock.deliver({ kind: "auth_ok" });
    expect(sock.subscribedChannels().sort()).toEqual(["pipeline:p1", "user:u1"]);
  });

  it("routes an event frame to only the matching channel's handler", async () => {
    const { mux, sockets } = setup();
    const board = vi.fn();
    const notif = vi.fn();
    mux.subscribe("pipeline:p1", board);
    mux.subscribe("user:u1", notif);
    await flush();
    const sock = sockets[0]!;
    sock.open();
    sock.deliver({ kind: "auth_ok" });

    sock.deliver({ kind: "event", channel: "pipeline:p1", event: { seq: 0, type: "x", data: {} } });
    expect(board).toHaveBeenCalledTimes(1);
    expect(notif).not.toHaveBeenCalled();
  });

  it("subscribes a channel added after auth without a new socket", async () => {
    const { mux, sockets } = setup();
    mux.subscribe("pipeline:p1", vi.fn());
    await flush();
    const sock = sockets[0]!;
    sock.open();
    sock.deliver({ kind: "auth_ok" });

    mux.subscribe("user:u1", vi.fn());
    expect(sockets).toHaveLength(1);
    expect(sock.subscribedChannels()).toContain("user:u1");
  });

  it("closes the socket once the last handler unsubscribes", async () => {
    const { mux, sockets } = setup();
    const unsub = mux.subscribe("pipeline:p1", vi.fn());
    await flush();
    const sock = sockets[0]!;
    sock.open();
    sock.deliver({ kind: "auth_ok" });
    unsub();
    expect(sock.closed).toBe(true);
  });

  it("notifies live handlers with a reconnect frame when the socket drops", async () => {
    const { mux, sockets } = setup();
    const board = vi.fn();
    mux.subscribe("pipeline:p1", board);
    await flush();
    const sock = sockets[0]!;
    sock.open();
    sock.deliver({ kind: "auth_ok" });
    board.mockClear();

    sock.close();
    expect(board).toHaveBeenCalledWith({ kind: "reconnect" } satisfies WsFrame);
  });

  it("never connects when the url is empty (realtime disabled / jsdom)", async () => {
    const { mux, sockets, mintTicket } = setup("");
    mux.subscribe("pipeline:p1", vi.fn());
    await flush();
    expect(mintTicket).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });
});
