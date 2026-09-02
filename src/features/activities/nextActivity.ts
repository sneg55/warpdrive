import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { activities, deals } from "@/db/schema";
import type { DbOrTx } from "@/server/realtime/channelVersions";

const doneInstant = sql<Date | null>`coalesce(${activities.dueAt}, ${activities.doneAt})`.mapWith(
  activities.dueAt,
);

export async function recomputeDealsActivityDates(
  db: DbOrTx,
  dealIds: Iterable<string>,
  signal: AbortSignal,
): Promise<void> {
  for (const dealId of [...new Set(dealIds)].sort()) {
    await recomputeDealActivityDates(db, dealId, signal);
  }
}

export async function recomputeDealActivityDates(
  db: DbOrTx,
  dealId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.execute(sql`SELECT id FROM deals WHERE id = ${dealId} FOR NO KEY UPDATE`);
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
  signal.throwIfAborted();
  const [last] = await db
    .select({ at: doneInstant })
    .from(activities)
    .where(
      and(
        eq(activities.dealId, dealId),
        eq(activities.done, true),
        isNull(activities.deletedAt),
        isNotNull(doneInstant),
      ),
    )
    .orderBy(desc(doneInstant))
    .limit(1);
  signal.throwIfAborted();
  await db
    .update(deals)
    .set({
      nextActivityAt: next?.dueAt ?? null,
      lastActivityAt: last?.at ?? null,
      updatedAt: sql`${deals.updatedAt}`,
    })
    .where(eq(deals.id, dealId));
}
