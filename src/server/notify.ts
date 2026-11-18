import { sql } from "drizzle-orm";
import { bumpChannelVersion, type DbOrTx } from "./realtime/channelVersions";
import type { PublishedEvent } from "./ws/payload";

export async function publishEvent(
  tx: DbOrTx,
  event: PublishedEvent,
  signal: AbortSignal,
): Promise<void> {
  await bumpChannelVersion(tx, event.channel, signal);
  await tx.execute(sql`SELECT pg_notify(${event.channel}, ${JSON.stringify(event)})`);
  signal.throwIfAborted();
}
