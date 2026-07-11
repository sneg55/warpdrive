import { sql } from "drizzle-orm";
import { bumpChannelVersion, type DbOrTx } from "./realtime/channelVersions";
import type { PublishedEvent } from "./ws/payload";

// Bump the channel version AND pg_notify in the SAME tx, so a rolled-back write
// publishes nothing and the WS server can order/de-dup the stream (ops spec A4).
// The published payload carries NO seq: the WS server stamps a per-socket seq at
// send time. This is the single publish path; all callers (e.g. publishBoardEvent)
// delegate here.
export async function publishEvent(
  tx: DbOrTx,
  event: PublishedEvent,
  signal: AbortSignal,
): Promise<void> {
  await bumpChannelVersion(tx, event.channel, signal);
  await tx.execute(sql`SELECT pg_notify(${event.channel}, ${JSON.stringify(event)})`);
  signal.throwIfAborted();
}
