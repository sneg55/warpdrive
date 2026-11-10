import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { mailboxAccessPredicate } from "./mailboxAccess";

export type NeighborFolder = "inbox" | "sent" | "archive";

export interface ThreadNeighbors {
  prevId: string | null;
  nextId: string | null;
  index: number;
  total: number;
}

function folderPredicate(folder: NeighborFolder): SQL {
  switch (folder) {
    case "inbox":
      return sql`t.archived_at IS NULL AND t.trashed_at IS NULL`;
    case "archive":
      return sql`t.archived_at IS NOT NULL AND t.trashed_at IS NULL`;
    case "sent":
      return sql`t.trashed_at IS NULL AND EXISTS (
        SELECT 1 FROM email_messages m
        WHERE m.thread_id = t.id AND m.direction = 'outbound' AND m.sent_at IS NOT NULL
      )`;
  }
}

function folderOrder(folder: NeighborFolder): SQL {
  switch (folder) {
    case "inbox":
      return sql`t.last_message_at DESC NULLS LAST, t.id DESC`;
    case "archive":
      return sql`t.archived_at DESC NULLS LAST, t.id DESC`;
    case "sent":
      return sql`(
        SELECT MAX(m.sent_at) FROM email_messages m
        WHERE m.thread_id = t.id AND m.direction = 'outbound' AND m.sent_at IS NOT NULL
      ) DESC NULLS LAST, t.id DESC`;
  }
}

export async function getThreadNeighbors(
  db: Db,
  args: { actor: AuthUser; threadId: string; folder: NeighborFolder },
  signal: AbortSignal,
): Promise<ThreadNeighbors | null> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      WITH ordered AS (
        SELECT t.id,
          ROW_NUMBER() OVER w AS rn,
          COUNT(*) OVER () AS total,
          LAG(t.id) OVER w AS prev_id,
          LEAD(t.id) OVER w AS next_id
        FROM email_threads t
          JOIN email_accounts a ON a.id = t.account_id
        WHERE a.id = (SELECT account_id FROM email_threads WHERE id=${args.threadId})
          AND ${mailboxAccessPredicate(args.actor.id)} AND ${folderPredicate(args.folder)}
        WINDOW w AS (ORDER BY ${folderOrder(args.folder)})
      )
      SELECT prev_id, next_id, rn, total FROM ordered WHERE id = ${args.threadId}
    `)
  ).rows[0] as
    | {
        prev_id: string | null;
        next_id: string | null;
        rn: number | string;
        total: number | string;
      }
    | undefined;
  signal.throwIfAborted();
  if (row === undefined) return null;
  return {
    prevId: row.prev_id,
    nextId: row.next_id,
    index: Number(row.rn),
    total: Number(row.total),
  };
}
