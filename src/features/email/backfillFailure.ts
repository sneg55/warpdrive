import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";

export async function recordBackfillFailure(
  db: Db,
  accountId: string,
  failure: { ok: false; error: AppError },
  signal: AbortSignal,
): Promise<{ ok: false; error: AppError }> {
  await db.execute(
    sql`UPDATE email_accounts SET backfill_status='failed', backfill_error_id=${failure.error.id} WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  return failure;
}
