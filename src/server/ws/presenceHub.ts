// Presence hub: manages per-channel sender registries and orchestrates
// PresenceRegistry join/leave/drop and broadcast. Created once per
// startWsServer call so multiple test servers never share state.
//
// Presence frames are NEVER seq-stamped and NEVER go through the relay.
// Frame shape: { kind: "presence", channel, users: [{ userId, name }] }

import { PresenceRegistry, type PresenceUser } from "./presence";

// Channel families that participate in presence tracking.
export const PRESENCE_CHANNEL_PREFIXES = ["deal:", "pipeline:"] as const;

export function isPresenceChannel(channel: string): boolean {
  return PRESENCE_CHANNEL_PREFIXES.some((prefix) => channel.startsWith(prefix));
}

export interface PresenceFrame {
  kind: "presence";
  channel: string;
  users: PresenceUser[];
}

// sender: a function that delivers a raw JSON string to one socket.
type Sender = (json: string) => void;

export class PresenceHub {
  private readonly registry = new PresenceRegistry();
  // channel -> connId -> send function
  private readonly senders = new Map<string, Map<string, Sender>>();

  private broadcastPresence(channel: string): void {
    const byConn = this.senders.get(channel);
    if (!byConn || byConn.size === 0) return;
    const frame: PresenceFrame = {
      kind: "presence",
      channel,
      users: this.registry.snapshot(channel),
    };
    const json = JSON.stringify(frame);
    for (const send of byConn.values()) send(json);
  }

  join(channel: string, connId: string, userId: string, name: string, sender: Sender): void {
    let byConn = this.senders.get(channel);
    if (!byConn) {
      byConn = new Map();
      this.senders.set(channel, byConn);
    }
    byConn.set(connId, sender);
    this.registry.join(channel, { userId, name, connId });
    this.broadcastPresence(channel);
  }

  leave(channel: string, connId: string): void {
    const byConn = this.senders.get(channel);
    if (byConn) {
      byConn.delete(connId);
      if (byConn.size === 0) this.senders.delete(channel);
    }
    this.registry.leave(channel, connId);
    this.broadcastPresence(channel);
  }

  // Called on socket close. Returns affected channels (for logging if needed).
  dropConnection(connId: string): string[] {
    const affected = this.registry.dropConnection(connId);
    for (const channel of affected) {
      const byConn = this.senders.get(channel);
      if (byConn) {
        byConn.delete(connId);
        if (byConn.size === 0) this.senders.delete(channel);
      }
      this.broadcastPresence(channel);
    }
    return affected;
  }
}
