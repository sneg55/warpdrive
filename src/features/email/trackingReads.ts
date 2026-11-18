import { desc, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { emailTrackingEvents } from "@/db/schema";

export interface TrackingEvent {
  type: "open" | "click";
  at: string;
}

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
