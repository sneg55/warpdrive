"use client";

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
  private readonly handlers = new Map<string, Set<ChannelHandler>>();
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
    if (this.handlers.size === 0) this.closeSocket();
  }

  private ensureConnected(): void {
    if (this.state !== "idle") return;
    if (this.url === "") return;
    this.state = "connecting";
    void this.connect();
  }

  private async connect(): Promise<void> {
    let ticket: string;
    try {
      ticket = await this.mintTicket();
    } catch {
      this.state = "idle";
      this.notifyAll({ kind: "reconnect" });
      return;
    }
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
    if (typeof frame.channel === "string") {
      const set = this.handlers.get(frame.channel);
      if (set !== undefined) for (const h of set) h(frame);
      return;
    }
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
    this.notifyAll({ kind: "reconnect" });
  }

  private closeSocket(): void {
    const s = this.socket;
    this.socket = null;
    this.state = "idle";
    this.subscribedOnSocket.clear();
    if (s !== null) {
      s.onclose = null;
      s.close();
    }
  }

  private notifyAll(frame: WsFrame): void {
    for (const set of this.handlers.values()) for (const h of set) h(frame);
  }
}
