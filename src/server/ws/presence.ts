// Ephemeral in-memory presence registry. Never persisted, never via NOTIFY.
// channel -> connId -> Member tracks all active connections per channel.
// Multiple connections for the same userId are deduplicated in snapshots.

interface Member {
  userId: string;
  name: string;
  connId: string;
  since: number;
}

export interface PresenceUser {
  userId: string;
  name: string;
}

export interface PresenceEvent {
  channel: string;
  users: PresenceUser[];
}

export class PresenceRegistry {
  // channel -> connId -> member
  private byChannel = new Map<string, Map<string, Member>>();

  private snapshotUsers(channel: string): PresenceUser[] {
    const members = this.byChannel.get(channel);
    if (!members) return [];
    const seen = new Map<string, PresenceUser>();
    for (const m of members.values()) {
      if (!seen.has(m.userId)) seen.set(m.userId, { userId: m.userId, name: m.name });
    }
    return [...seen.values()];
  }

  join(channel: string, member: { userId: string; name: string; connId: string }): PresenceEvent {
    let members = this.byChannel.get(channel);
    if (!members) {
      members = new Map();
      this.byChannel.set(channel, members);
    }
    members.set(member.connId, { ...member, since: Date.now() });
    return { channel, users: this.snapshotUsers(channel) };
  }

  leave(channel: string, connId: string): PresenceEvent {
    this.byChannel.get(channel)?.delete(connId);
    return { channel, users: this.snapshotUsers(channel) };
  }

  snapshot(channel: string): PresenceUser[] {
    return this.snapshotUsers(channel);
  }

  dropConnection(connId: string): string[] {
    const affected: string[] = [];
    for (const [channel, members] of this.byChannel) {
      if (members.delete(connId)) affected.push(channel);
    }
    return affected;
  }
}
