import { sql } from "drizzle-orm";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type ActionResult, toClientResult } from "@/types/actionResult";
import type { Result } from "@/types/result";

type SendValue = { status: string; messageId?: string };

export async function sendActionResult(
  db: Db,
  result: Result<SendValue, AppError>,
  attempt: { accountId: string; idempotencyKey: string },
  signal: AbortSignal,
): Promise<ActionResult<SendValue>> {
  if (!result.ok || result.value.status !== "failed") return toClientResult(result);
  const row = (
    await db.execute(sql`SELECT error_id, send_started_at IS NOT NULL AS started
      FROM email_send_attempts
      WHERE account_id=${attempt.accountId} AND idempotency_key=${attempt.idempotencyKey}`)
  ).rows[0] as { error_id: string | null; started: boolean } | undefined;
  signal.throwIfAborted();
  if (row?.started === true)
    return { ok: false, error: { id: ERROR_IDS.GMAIL_SEND_MAY_HAVE_SENT } };
  return { ok: false, error: { id: row?.error_id ?? ERROR_IDS.GMAIL_API_EXHAUSTED } };
}
