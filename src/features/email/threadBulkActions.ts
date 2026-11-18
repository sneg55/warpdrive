import type { ActionResult } from "@/types/actionResult";

export const BULK_ACTION_ERROR = "Couldn't update some threads. Please try again.";

export async function runBulk(
  ids: readonly string[],
  action: (threadId: string) => Promise<ActionResult<{ threadId: string }>>,
): Promise<string[]> {
  const outcomes = await Promise.all(ids.map(async (id) => ({ id, result: await action(id) })));
  return outcomes.filter((o) => !o.result.ok).map((o) => o.id);
}
