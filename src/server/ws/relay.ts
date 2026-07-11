import type { Client, Notification } from "pg";
import type { NotifyEvent } from "./payload";
import { parseNotifyPayload } from "./payload";

// Server-owned Postgres LISTEN relay (ops spec A3): the ONLY source of relayed
// events is pg_notify, never a client frame. A dedicated pg Client (not the
// pooled app db) issues LISTEN per channel that has >= 1 subscriber and UNLISTEN
// when the last subscriber leaves. NOTIFY payloads are validated with
// parseNotifyPayload (size + shape) before fan-out.
export type RelayListener = (event: NotifyEvent) => void;

export interface Relay {
  subscribe: (channel: string, listener: RelayListener) => Promise<void>;
  unsubscribe: (channel: string, listener: RelayListener) => Promise<void>;
  close: () => Promise<void>;
}

// Quote a channel name for LISTEN/UNLISTEN. pg identifiers cannot be parameterized,
// so we double-quote and escape embedded quotes. Channel names are server-built
// ("family:id"); this is defense in depth, not the primary trust boundary.
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function createRelay(client: Client): Relay {
  // channel -> set of per-socket listeners.
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
    // Guard against a payload whose channel field disagrees with the NOTIFY channel.
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
      // UNLISTEN cleanup is best-effort: during shutdown or teardown the pg
      // client may already be ending, at which point the connection going away
      // achieves the same result. Log rather than swallow so a genuine query
      // failure (not a closed client) stays visible.
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
