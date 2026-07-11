import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
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
  await db
    .update(deals)
    .set({ nextActivityAt: next?.dueAt ?? null })
    .where(eq(deals.id, dealId));
}
