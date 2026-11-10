import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { schedulePendingBackfill } from "./teamBackfillJobs";
import { assertTeamMailboxAdmin } from "./teamMailboxConnect";

export async function setTeamMailboxMembers(
  db: Db,
  args: { actorId: string; accountId: string; userIds: string[] },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const ids = JSON.stringify([...new Set(args.userIds)]);
  const wanted = sql`SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb)`;
  const result = await db.transaction(async (tx) => {
    const account = await tx.execute(
      sql`SELECT id FROM email_accounts WHERE id=${args.accountId} AND kind='team' FOR UPDATE`,
    );
    signal.throwIfAborted();
    if (account.rows.length === 0)
      return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "team mailbox not found", {}));
    const missing = await tx.execute(
      sql`SELECT id FROM (${wanted}) AS selected(id) WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id=selected.id AND is_active)`,
    );
    signal.throwIfAborted();
    if (missing.rows.length > 0)
      return err(
        new AppError(
          ERROR_IDS.GMAIL_TEAM_MAILBOX_INPUT_INVALID,
          "member not found or inactive",
          {},
        ),
      );
    await tx.execute(
      sql`DELETE FROM email_drafts WHERE account_id=${args.accountId} AND author_user_id NOT IN (${wanted})`,
    );
    signal.throwIfAborted();
    await tx.execute(sql`DELETE FROM email_send_attempts WHERE account_id=${args.accountId} AND send_started_at IS NULL AND sent_at IS NULL
      AND payload->>'actorId' NOT IN (SELECT value FROM jsonb_array_elements_text(${ids}::jsonb))`);
    signal.throwIfAborted();
    await tx.execute(
      sql`DELETE FROM email_account_members WHERE account_id=${args.accountId} AND user_id NOT IN (${wanted})`,
    );
    signal.throwIfAborted();
    await tx.execute(
      sql`INSERT INTO email_account_members (account_id, user_id) SELECT ${args.accountId}, value::uuid FROM jsonb_array_elements_text(${ids}::jsonb) ON CONFLICT DO NOTHING`,
    );
    signal.throwIfAborted();
    return ok(undefined);
  });
  signal.throwIfAborted();
  if (result.ok) await schedulePendingBackfill(db, args.accountId, signal);
  return result;
}
