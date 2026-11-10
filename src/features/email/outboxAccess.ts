import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";

export async function assertAttemptSender(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const rows =
    await db.execute(sql`SELECT 1 FROM email_send_attempts s JOIN email_accounts a ON a.id=s.account_id
    WHERE s.id=${attemptId} AND (a.kind='personal' OR EXISTS (
      SELECT 1 FROM email_account_members am WHERE am.account_id=a.id AND am.user_id::text=s.payload->>'actorId'
    ))`);
  signal.throwIfAborted();
  return rows.rows.length > 0
    ? ok(undefined)
    : err(
        new AppError(
          ERROR_IDS.PERM_TEAM_MAILBOX_MEMBER_REQUIRED,
          "sender no longer belongs to team mailbox",
          {},
        ),
      );
}
