import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { activities, deals } from "@/db/schema";
import type { DbOrTx } from "@/server/realtime/channelVersions";

// Sets deals.next_activity_at to the soonest OPEN, DATED activity on the deal, or null if none.
export async function recomputeNextActivity(
  db: DbOrTx,
  dealId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const [next] = await db
    .select({ dueAt: activities.dueAt })
    .from(activities)
    .where(
      and(
        eq(activities.dealId, dealId),
        eq(activities.done, false),
        isNull(activities.deletedAt),
        isNotNull(activities.dueAt),
      ),
    )
    .orderBy(asc(activities.dueAt))
    .limit(1);
  // Hold updated_at at its current value: the column's $onUpdate would otherwise bump it on this
  // write, and it is the compare-and-swap token open deal editors hold. next_activity_at is a
  // derived cache of the deal's activities, so recomputing it must not invalidate their token
  // (E_DEAL_002 "This deal changed elsewhere" right after adding an activity).
  await db
    .update(deals)
    .set({ nextActivityAt: next?.dueAt ?? null, updatedAt: sql`${deals.updatedAt}` })
    .where(eq(deals.id, dealId));
}
