// Bulk-action helpers extracted from ThreadList.tsx to keep that toolbar host under the 300-line
// cap. Pure/logic-only (no JSX), so the list component keeps a single responsibility: rendering.
import type { AppError } from "@/constants/errorIds";
import type { Result } from "@/types/result";

// Shared by all three bulk actions: no per-cause copy since the user just needs to know some of the
// selected threads need retrying, not why (each action already has its own specific server-side
// AppError id for anyone digging into logs).
export const BULK_ACTION_ERROR = "Couldn't update some threads. Please try again.";

// Runs `action` for every id in parallel and returns the ids whose action failed, so the caller can
// keep exactly those selected instead of silently dropping the partial failure (mirrors PeopleList's
// bulk-delete semantics).
export async function runBulk(
  ids: readonly string[],
  action: (threadId: string) => Promise<Result<{ threadId: string }, AppError>>,
): Promise<string[]> {
  const outcomes = await Promise.all(ids.map(async (id) => ({ id, result: await action(id) })));
  return outcomes.filter((o) => !o.result.ok).map((o) => o.id);
}
