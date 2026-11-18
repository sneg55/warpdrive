import type { Client, Notification } from "pg";
import type { NotifyEvent } from "./payload";
import { parseNotifyPayload } from "./payload";

export type RelayListener = (event: NotifyEvent) => void;

export interface Relay {
  subscribe: (channel: string, listener: RelayListener) => Promise<void>;
  unsubscribe: (channel: string, listener: RelayListener) => Promise<void>;
  close: () => Promise<void>;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function createRelay(client: Client): Relay {
  const subscribers = new Map<string, Set<RelayListener>>();

  client.on("notification", (msg: Notification) => {
    const listeners = subscribers.get(msg.channel);
    if (listeners === undefined || listeners.size === 0) return;
    if (msg.payload === undefined) return;
    let raw: unknown;
    try {
      raw = JSON.parse(msg.payload);
    } catch {
      return;
    }
    const parsed = parseNotifyPayload(raw);
    if (!parsed.ok) return;
    if (parsed.value.channel !== msg.channel) return;
    for (const listener of listeners) listener(parsed.value);
  });

  async function subscribe(channel: string, listener: RelayListener): Promise<void> {
    let set = subscribers.get(channel);
    if (set === undefined) {
      set = new Set();
      subscribers.set(channel, set);
      await client.query(`LISTEN ${quoteIdent(channel)}`);
    }
    set.add(listener);
  }

  async function unsubscribe(channel: string, listener: RelayListener): Promise<void> {
    const set = subscribers.get(channel);
    if (set === undefined) return;
    set.delete(listener);
    if (set.size === 0) {
      subscribers.delete(channel);
      try {
        await client.query(`UNLISTEN ${quoteIdent(channel)}`);
      } catch (e) {
        console.warn(`ws relay: UNLISTEN ${channel} failed (client likely closing)`, e);
      }
    }
  }

  return {
    subscribe,
    unsubscribe,
    close: () => client.end(),
  };
}
