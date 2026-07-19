"use client";

// One WebSocket per browser tab, multiplexed across channels. Each caller subscribes to a channel
// with a handler; the multiplexer mints ONE ticket, opens ONE socket, sends one subscribe frame per
// distinct channel, and routes inbound frames to the handlers registered for frame.channel. This
// replaces the previous model where every realtime hook opened its own socket + ticket round trip.
//
// Behavior matches the old per-hook sockets: on socket close each handler is notified with a
// synthetic { kind: "reconnect" } frame (so it invalidates/refetches the same way it did in its own
// onclose), and the socket is NOT auto-reconnected (a later subscribe from a component mount revives
// it for every live channel). The server tags event frames with their channel and stamps a
// per-channel seq, so a handler's gap detection stays correct on the shared socket.

export interface WsFrame {
  kind: string;
  channel?: string;
  event?: { seq: number; type: string; data: unknown };
  users?: unknown;
}

export type ChannelHandler = (frame: WsFrame) => void;
export type TicketMinter = () => Promise<string>;
export type SocketFactory = (url: string) => WebSocket;

type State = "idle" | "connecting" | "authed";

export class WsMultiplexer {
  private socket: WebSocket | null = null;
  private state: State = "idle";
  // channel -> the set of live handlers for it.
  private readonly handlers = new Map<string, Set<ChannelHandler>>();
  // channels for which a subscribe frame has been sent on the current socket.
  private readonly subscribedOnSocket = new Set<string>();

  constructor(
    private readonly url: string,
    private readonly mintTicket: TicketMinter,
    private readonly makeSocket: SocketFactory = (u) => new WebSocket(u),
  ) {}

  subscribe(channel: string, handler: ChannelHandler): () => void {
    let set = this.handlers.get(channel);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    this.ensureConnected();
    // Already on a live socket: subscribe this channel now. Otherwise it is sent on auth_ok.
    if (this.state === "authed") this.sendSubscribe(channel);
    return () => this.removeHandler(channel, handler);
  }

  private removeHandler(channel: string, handler: ChannelHandler): void {
    const set = this.handlers.get(channel);
    if (set === undefined) return;
    set.delete(handler);
    if (set.size > 0) return;
    this.handlers.delete(channel);
    if (this.socket !== null && this.state === "authed" && this.subscribedOnSocket.has(channel)) {
      this.socket.send(JSON.stringify({ kind: "unsubscribe", channel }));
      this.subscribedOnSocket.delete(channel);
    }
    // No live channels left: drop the socket entirely.
    if (this.handlers.size === 0) this.closeSocket();
  }

  private ensureConnected(): void {
    if (this.state !== "idle") return;
    // Realtime disabled / jsdom: no endpoint, so never connect (matches the old hooks' guard).
    if (this.url === "") return;
    this.state = "connecting";
    void this.connect();
  }

  private async connect(): Promise<void> {
    let ticket: string;
    try {
      ticket = await this.mintTicket();
    } catch {
      // Ticket failure: give up this attempt and tell handlers to refetch. Do not loop.
      this.state = "idle";
      this.notifyAll({ kind: "reconnect" });
      return;
    }
    // Everyone unsubscribed while the ticket was minting.
    if (this.handlers.size === 0) {
      this.state = "idle";
      return;
    }
    const ws = this.makeSocket(this.url);
    this.socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ kind: "auth", ticket }));
    ws.onmessage = (evt: MessageEvent<string>) => this.onMessage(evt.data);
    ws.onclose = () => this.onClose();
  }

  private onMessage(data: string): void {
    let frame: WsFrame;
    try {
      frame = JSON.parse(data) as WsFrame;
    } catch {
      return;
    }
    if (frame.kind === "auth_ok") {
      this.state = "authed";
      this.subscribedOnSocket.clear();
      for (const channel of this.handlers.keys()) this.sendSubscribe(channel);
      return;
    }
    // event / presence frames carry their channel: route to that channel's handlers only.
    if (typeof frame.channel === "string") {
      const set = this.handlers.get(frame.channel);
      if (set !== undefined) for (const h of set) h(frame);
      return;
    }
    // Channel-less frames (e.g. a global resync): fan out so every handler can react.
    this.notifyAll(frame);
  }

  private sendSubscribe(channel: string): void {
    if (this.socket === null || this.state !== "authed") return;
    if (this.subscribedOnSocket.has(channel)) return;
    this.subscribedOnSocket.add(channel);
    this.socket.send(JSON.stringify({ kind: "subscribe", channel }));
  }

  private onClose(): void {
    this.socket = null;
    this.state = "idle";
    this.subscribedOnSocket.clear();
    // Handlers missed any events while offline: nudge them to refetch (their old onclose path).
    this.notifyAll({ kind: "reconnect" });
  }

  private closeSocket(): void {
    const s = this.socket;
    this.socket = null;
    this.state = "idle";
    this.subscribedOnSocket.clear();
    if (s !== null) {
      // Drop our onclose so tearing down an idle socket does not fire a spurious reconnect nudge.
      s.onclose = null;
      s.close();
    }
  }

  private notifyAll(frame: WsFrame): void {
    for (const set of this.handlers.values()) for (const h of set) h(frame);
  }
}
