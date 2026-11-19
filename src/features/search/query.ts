import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import type { Result } from "@/types/result";
import { err, ok } from "@/types/result";
import type { SearchResults } from "@/types/search";
import { buildSearchPattern } from "./pattern";
import { searchSection } from "./sectionSearch";
import { toVisibilityCtx } from "./visibilitySql";

export async function searchAll(
  db: Db,
  actor: PermSetUser,
  q: string,
  signal: AbortSignal,
): Promise<Result<SearchResults, AppError>> {
  signal.throwIfAborted();

  const rawQuery = q.trim();
  if (rawQuery.length === 0) {
    return err(new AppError(ERROR_IDS.SEARCH_EMPTY_QUERY, "empty search query", {}));
  }

  const base = {
    db,
    ctx: toVisibilityCtx(actor),
    pattern: buildSearchPattern(rawQuery),
    rawQuery,
    signal,
  };
  const deals = await searchSection({ ...base, section: "deal" });
  const people = await searchSection({ ...base, section: "person" });
  const organizations = await searchSection({ ...base, section: "organization" });
  const leads = await searchSection({ ...base, section: "lead" });

  return ok({ deals, people, organizations, leads });
}
