import { and, eq, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  activities,
  dealFollowers,
  dealParticipants,
  emailThreads,
  files,
  notes,
} from "@/db/schema";
import { recomputeDealActivityDates } from "@/features/activities/nextActivity";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function repointDealChildren(
  tx: Tx,
  sourceId: string,
  targetId: string,
  signal: AbortSignal,
): Promise<void> {
  await tx.update(activities).set({ dealId: targetId }).where(eq(activities.dealId, sourceId));
  await recomputeDealActivityDates(tx, targetId, signal);
  await tx.update(emailThreads).set({ dealId: targetId }).where(eq(emailThreads.dealId, sourceId));
  await tx
    .update(notes)
    .set({ entityId: targetId })
    .where(and(eq(notes.entityType, "deal"), eq(notes.entityId, sourceId)));
  await tx
    .update(files)
    .set({ entityId: targetId })
    .where(and(eq(files.entityType, "deal"), eq(files.entityId, sourceId)));

  await tx
    .update(dealParticipants)
    .set({ dealId: targetId })
    .where(
      and(
        eq(dealParticipants.dealId, sourceId),
        notInArray(
          dealParticipants.personId,
          tx
            .select({ personId: dealParticipants.personId })
            .from(dealParticipants)
            .where(eq(dealParticipants.dealId, targetId)),
        ),
      ),
    );
  await tx.delete(dealParticipants).where(eq(dealParticipants.dealId, sourceId));

  await tx
    .update(dealFollowers)
    .set({ dealId: targetId })
    .where(
      and(
        eq(dealFollowers.dealId, sourceId),
        notInArray(
          dealFollowers.userId,
          tx
            .select({ userId: dealFollowers.userId })
            .from(dealFollowers)
            .where(eq(dealFollowers.dealId, targetId)),
        ),
      ),
    );
  await tx.delete(dealFollowers).where(eq(dealFollowers.dealId, sourceId));
}
