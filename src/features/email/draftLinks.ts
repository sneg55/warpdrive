import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";

// link_deal_id / link_person_id are untyped uuids (mirroring email_threads.deal_id), so nothing at
// the database level rejects an id that names no record. Check both before the write so a bad id
// from a caller that never rendered the picker (MCP, an import) is a typed error, not a silent
// draft pinned to nothing. Existence only: whether the actor may SEE the record is the caller's
// business, and a draft carries no read grant of its own.
export async function assertDraftLinks(
  db: Db,
  links: { linkDealId?: string | null; linkPersonId?: string | null },
  signal: AbortSignal,
): Promise<Result<null, AppError>> {
  signal.throwIfAborted();
  const dealId = links.linkDealId ?? null;
  if (dealId !== null) {
    const row = (await db.execute(sql`SELECT 1 FROM deals WHERE id = ${dealId}`)).rows[0];
    if (row === undefined)
      return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "draft deal link not found", {}));
  }
  const personId = links.linkPersonId ?? null;
  if (personId !== null) {
    const row = (await db.execute(sql`SELECT 1 FROM persons WHERE id = ${personId}`)).rows[0];
    if (row === undefined)
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "draft person link not found", {}));
  }
  signal.throwIfAborted();
  return ok(null);
}
