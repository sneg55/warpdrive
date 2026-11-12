import { inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import {
  intercomConversationContacts,
  intercomConversationParts,
  intercomConversations,
  intercomSyncState,
} from "@/db/schema";
import { chunks, uniqueBy } from "./batch";
import { type ContactRow, upsertContacts } from "./contactRepo";
import type { NormalizedConversation } from "./normalize";

type Db = NodePgDatabase<typeof schema>;

export interface StoredConversation extends NormalizedConversation {
  contactIds: string[];
}

export interface SearchResume {
  updatedAfter: number;
  startingAfter: string;
  held: boolean;
}

export interface PageWrite {
  conversations: StoredConversation[];
  deletedIds: string[];
  contacts: ContactRow[];
  cursor: number;
  resume: SearchResume | null;
  fetchedAt: Date;
}

export interface SyncState {
  cursor: number;
  stalledRuns: number;
  resume: SearchResume | null;
}

export async function readSyncState(db: Db, signal: AbortSignal): Promise<SyncState | null> {
  signal.throwIfAborted();
  const [row] = await db.select().from(intercomSyncState).limit(1);
  if (row === undefined) return null;
  const resume =
    row.resumeUpdatedAfter === null || row.resumeStartingAfter === null
      ? null
      : {
          updatedAfter: row.resumeUpdatedAfter,
          startingAfter: row.resumeStartingAfter,
          held: row.resumeHeld,
        };
  return { cursor: row.cursorUpdatedAt, stalledRuns: row.stalledRuns, resume };
}

export async function writeRunEnd(
  db: Db,
  end: { stalledRuns: number; clearResume: boolean },
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.update(intercomSyncState).set(
    end.clearResume
      ? {
          stalledRuns: end.stalledRuns,
          resumeUpdatedAfter: null,
          resumeStartingAfter: null,
          resumeHeld: false,
        }
      : { stalledRuns: end.stalledRuns },
  );
}

export async function storedUpdatedAt(
  db: Db,
  ids: string[],
  signal: AbortSignal,
): Promise<Map<string, number>> {
  signal.throwIfAborted();
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: intercomConversations.id, updatedAt: intercomConversations.updatedAt })
    .from(intercomConversations)
    .where(inArray(intercomConversations.id, ids));
  return new Map(rows.map((r) => [r.id, Math.floor(r.updatedAt.getTime() / 1000)]));
}

function pageRows(page: PageWrite) {
  const conversations = uniqueBy(page.conversations, (c) => c.conversation.id);
  return {
    conversations: conversations.map((c) => c.conversation),
    parts: uniqueBy(
      conversations.flatMap((c) => c.parts),
      (p) => p.id,
    ),
    links: uniqueBy(
      conversations.flatMap((c) =>
        c.contactIds.map((contactId) => ({ conversationId: c.conversation.id, contactId })),
      ),
      (l) => JSON.stringify([l.conversationId, l.contactId]),
    ),
    touched: [...page.deletedIds, ...conversations.map((c) => c.conversation.id)],
  };
}

export async function writePage(db: Db, page: PageWrite, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const rows = pageRows(page);
  const state = {
    cursorUpdatedAt: page.cursor,
    lastRunAt: page.fetchedAt,
    resumeUpdatedAfter: page.resume?.updatedAfter ?? null,
    resumeStartingAfter: page.resume?.startingAfter ?? null,
    resumeHeld: page.resume?.held ?? false,
  };
  await db.transaction(async (tx) => {
    await upsertContacts(tx, page.contacts, page.fetchedAt);
    for (const batch of chunks(rows.parts)) {
      const ids = batch.map((p) => p.id);
      await tx.delete(intercomConversationParts).where(inArray(intercomConversationParts.id, ids));
    }
    for (const batch of chunks(rows.touched)) {
      await tx.delete(intercomConversations).where(inArray(intercomConversations.id, batch));
    }
    for (const batch of chunks(rows.conversations)) {
      await tx.insert(intercomConversations).values(batch);
    }
    for (const batch of chunks(rows.parts))
      await tx.insert(intercomConversationParts).values(batch);
    for (const batch of chunks(rows.links)) {
      await tx.insert(intercomConversationContacts).values(batch);
    }
    await tx
      .insert(intercomSyncState)
      .values(state)
      .onConflictDoUpdate({ target: intercomSyncState.id, set: state });
  });
}
