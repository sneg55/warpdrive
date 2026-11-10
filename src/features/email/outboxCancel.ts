import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { outboxAuthorPredicate } from "./authorPredicates";

export async function cancelOutbox(
  db: Db,
  args: { actor: AuthUser; attemptId: string },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  const found = (
    await db.execute(sql`
      SELECT s.id, s.claim_token, s.sent_at, s.status
      FROM email_send_attempts s JOIN email_accounts a ON a.id = s.account_id
      WHERE s.id = ${args.attemptId} AND ${outboxAuthorPredicate(args.actor.id)}
    `)
  ).rows[0] as
    | { id: string; claim_token: string | null; sent_at: string | null; status: string }
    | undefined;
  signal.throwIfAborted();
  if (found === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_OUTBOX_NOT_FOUND, "attempt not found", {}));
  if (found.claim_token !== null || found.sent_at !== null || found.status === "sent") {
    return err(
      new AppError(ERROR_IDS.GMAIL_OUTBOX_NOT_CANCELABLE, "attempt already claimed or sent", {}),
    );
  }
  const deleted = (
    await db.execute(sql`
      DELETE FROM email_send_attempts
      WHERE id = ${args.attemptId} AND claim_token IS NULL AND sent_at IS NULL AND status <> 'sent'
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (deleted === undefined)
    return err(
      new AppError(ERROR_IDS.GMAIL_OUTBOX_NOT_CANCELABLE, "attempt was claimed during cancel", {}),
    );
  return ok({ id: deleted.id });
}
