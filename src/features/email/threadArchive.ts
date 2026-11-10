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
  return db.transaction(async (tx) => {
    const row = (
      await tx.execute(sql`
      UPDATE email_threads t
      SET archived_at = ${expr}
      FROM email_accounts a
      WHERE t.account_id = a.id AND t.id = ${threadId} AND ${mailboxAccessPredicate(actor.id)}
      RETURNING t.id
    `)
    ).rows[0] as { id: string } | undefined;
    signal.throwIfAborted();
    if (row === undefined)
      return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));
    await publishTeamThreadUpdated(tx, row.id, actor.id, signal);
    return ok({ threadId: row.id });
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
