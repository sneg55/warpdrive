import { desc, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { emailTrackingEvents } from "@/db/schema";

export interface TrackingEvent {
  type: "open" | "click";
  at: string;
}

// Per-recipient open/click history for a set of messages, keyed by messageId, newest
// first. email_tracking_events.message_id is populated directly at insert time
// (recordEvent in trackingRecord.ts refuses to write until the token has backfilled with
// its message), so the event row already carries the FK to the message: no join through
// email_tracking_tokens is needed to resolve it.
export async function trackingForMessages(
  db: Db,
  messageIds: string[],
  signal: AbortSignal,
): Promise<Map<string, TrackingEvent[]>> {
  signal.throwIfAborted();
  const out = new Map<string, TrackingEvent[]>();
  if (messageIds.length === 0) return out;

  const rows = await db
    .select({
      messageId: emailTrackingEvents.messageId,
      eventType: emailTrackingEvents.eventType,
      occurredAt: emailTrackingEvents.occurredAt,
    })
    .from(emailTrackingEvents)
    .where(inArray(emailTrackingEvents.messageId, messageIds))
    .orderBy(desc(emailTrackingEvents.occurredAt));
  signal.throwIfAborted();

  for (const r of rows) {
    const list = out.get(r.messageId) ?? [];
    list.push({ type: r.eventType, at: r.occurredAt.toISOString() });
    out.set(r.messageId, list);
  }
  return out;
}
