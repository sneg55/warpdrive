import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { ok, type Result } from "@/types/result";
import { archiveDeal } from "./archiveDeal";

// Bulk archive/unarchive. Loops each id through the SAME per-deal auth path as archiveDeal
// (404-on-invisible, edit-permission gate) inside one transaction, so bulk can never bypass
// the single-deal authorization model. Ids that fail auth or do not resolve are skipped, they
// do NOT abort the batch; the returned count reflects only the deals actually toggled.
export async function archiveDeals(
  db: Db,
  actor: PermSetUser,
  ids: string[],
  archived: boolean,
  signal: AbortSignal,
): Promise<Result<number, AppError>> {
  return db.transaction(async (tx) => {
    let count = 0;
    for (const dealId of ids) {
      const r = await archiveDeal(tx, actor, { dealId, archived }, signal);
      if (r.ok) count += 1;
      signal.throwIfAborted();
    }
    return ok(count);
  });
}
