import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { INTERCOM_CONTACT_REFRESH_BATCH } from "@/constants/intercom";
import type * as schema from "@/db/schema";
import { staleContactIds, upsertContacts } from "./contactRepo";
import { enqueueDealSearchForWrite } from "./dealSearch/enqueueForWrite";
import { fetchContact, inBatches } from "./fetchItems";
import type { IntercomClient } from "./types";

type Db = NodePgDatabase<typeof schema>;

export async function refreshStaleContacts(
  deps: { db: Db; client: IntercomClient },
  staleBefore: Date,
  fetchedAt: Date,
  signal: AbortSignal,
): Promise<number> {
  const ids = await staleContactIds(deps.db, staleBefore, INTERCOM_CONTACT_REFRESH_BATCH, signal);
  const outcomes = await inBatches(ids, (id) => fetchContact(deps.client, id, signal), signal);
  const rows = outcomes.flatMap((o) => (o.ok ? [o.row] : []));
  signal.throwIfAborted();
  const changedContactIds = await upsertContacts(deps.db, rows, fetchedAt);
  await enqueueDealSearchForWrite(deps.db, { conversationIds: [], changedContactIds }, signal);
  return rows.length;
}
