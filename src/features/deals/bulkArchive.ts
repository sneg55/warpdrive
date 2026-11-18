import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { ok, type Result } from "@/types/result";
import { archiveDeal } from "./archiveDeal";

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
