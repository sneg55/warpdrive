import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { canSeeEmail } from "./emailVisibility";
import { canUseMailbox, mailboxAccessPredicate, mailboxScopePredicate } from "./mailboxAccess";
import { publishTeamThreadUpdated } from "./teamMailboxEvents";
import { unreadPredicate } from "./unreadPredicate";

async function setReadState(
  db: Db,
  args: { actor: AuthUser; threadId: string },
  read: boolean,
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`
    SELECT t.account_id, t.visibility, t.deal_id, t.person_id, a.kind
    FROM email_threads t JOIN email_accounts a ON a.id=t.account_id WHERE t.id=${args.threadId}
  `);
  signal.throwIfAborted();
  const thread = rows.rows[0] as
    | {
        account_id: string;
        visibility: string;
        deal_id: string | null;
        person_id: string | null;
        kind: string;
      }
    | undefined;
  if (thread === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));
  const visible =
    thread.kind === "team"
      ? await canUseMailbox(db, thread.account_id, args.actor.id, signal)
      : await canSeeEmail(
          db,
          args.actor,
          {
            accountId: thread.account_id,
            visibility: thread.visibility,
            dealId: thread.deal_id,
            personId: thread.person_id,
          },
          signal,
        );
  if (!visible) return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));
  await db.transaction(async (tx) => {
    if (thread.kind === "team") {
      await tx.execute(sql`UPDATE email_threads SET team_read_at=${read ? sql`now()` : sql`NULL`},
      team_read_by_user_id=${read ? args.actor.id : null} WHERE id=${args.threadId}`);
    } else if (read) {
      await tx.execute(sql`INSERT INTO email_thread_reads (thread_id, user_id, read_at)
      VALUES (${args.threadId}, ${args.actor.id}, now())
      ON CONFLICT (thread_id, user_id) DO UPDATE SET read_at=EXCLUDED.read_at`);
    } else {
      await tx.execute(
        sql`DELETE FROM email_thread_reads WHERE thread_id=${args.threadId} AND user_id=${args.actor.id}`,
      );
    }
    signal.throwIfAborted();
    await publishTeamThreadUpdated(tx, args.threadId, args.actor.id, signal);
  });
  signal.throwIfAborted();
  return ok({ threadId: args.threadId });
}

export function markThreadRead(
  db: Db,
  args: { actor: AuthUser; threadId: string },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  return setReadState(db, args, true, signal);
}

export function markThreadUnread(
  db: Db,
  args: { actor: AuthUser; threadId: string },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  return setReadState(db, args, false, signal);
}

export async function inboxUnreadCount(
  db: Db,
  args: { actor: AuthUser; mailbox?: string | null },
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted();
  const scope =
    args.mailbox === undefined
      ? mailboxAccessPredicate(args.actor.id)
      : mailboxScopePredicate(args.actor.id, args.mailbox ?? undefined);
  const rows = await db.execute(sql`SELECT count(*)::int AS count
    FROM email_threads t JOIN email_accounts a ON a.id=t.account_id
    LEFT JOIN email_thread_reads r ON a.kind='personal' AND r.thread_id=t.id AND r.user_id=${args.actor.id}
    WHERE ${scope} AND t.trashed_at IS NULL AND t.archived_at IS NULL AND (${unreadPredicate})`);
  signal.throwIfAborted();
  return (rows.rows[0] as { count: number }).count;
}
