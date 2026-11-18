import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { mailboxAccessPredicate } from "./mailboxAccess";
import { publishTeamThreadUpdated } from "./teamMailboxEvents";

async function setArchivedAt(
  db: Db,
  actor: AuthUser,
  threadId: string,
  value: "now" | "null",
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  signal.throwIfAborted();
  const expr = value === "now" ? sql`now()` : sql`NULL`;
  const notYetInTarget =
    value === "now" ? sql`t.archived_at IS NULL` : sql`t.archived_at IS NOT NULL`;
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(sql`
      UPDATE email_threads t
      SET archived_at = ${expr}
      FROM email_accounts a
      WHERE t.account_id = a.id AND t.id = ${threadId} AND ${mailboxAccessPredicate(actor.id)}
        AND ${notYetInTarget}
      RETURNING t.id
    `)
    ).rows[0] as { id: string } | undefined;
    signal.throwIfAborted();
    if (row !== undefined) {
      await publishTeamThreadUpdated(tx, row.id, actor.id, signal);
      return ok({ threadId: row.id });
    }
    const already = (
      await tx.execute(sql`
      SELECT t.id FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
      WHERE t.id = ${threadId} AND ${mailboxAccessPredicate(actor.id)}
    `)
    ).rows[0] as { id: string } | undefined;
    signal.throwIfAborted();
    if (already === undefined)
      return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));
    return ok({ threadId: already.id });
  });
}

export function archiveThread(
  db: Db,
  args: { actor: AuthUser; threadId: string },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  return setArchivedAt(db, args.actor, args.threadId, "now", signal);
}

export function unarchiveThread(
  db: Db,
  args: { actor: AuthUser; threadId: string },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  return setArchivedAt(db, args.actor, args.threadId, "null", signal);
}
