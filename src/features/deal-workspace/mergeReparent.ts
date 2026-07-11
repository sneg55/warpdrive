// Re-parent a source deal's child rows onto the target deal, inside the merge transaction.
// Extracted from mergeDeals.ts to keep that file small. Composite-PK children (participants on
// [deal_id, person_id], followers on [deal_id, user_id]) are repointed only where they would NOT
// collide with an existing target row, then the colliding remainder is deleted (mirrors the
// contact-merge collision-safe repoint) so the merge leaves no duplicate rows and no orphans.
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

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function repointDealChildren(
  tx: Tx,
  sourceId: string,
  targetId: string,
): Promise<void> {
  // Single-FK children: unconditional repoint.
  await tx.update(activities).set({ dealId: targetId }).where(eq(activities.dealId, sourceId));
  await tx.update(emailThreads).set({ dealId: targetId }).where(eq(emailThreads.dealId, sourceId));
  await tx
    .update(notes)
    .set({ entityId: targetId })
    .where(and(eq(notes.entityType, "deal"), eq(notes.entityId, sourceId)));
  await tx
    .update(files)
    .set({ entityId: targetId })
    .where(and(eq(files.entityType, "deal"), eq(files.entityId, sourceId)));

  // Participants (PK [deal_id, person_id]): move only people not already on the target, drop rest.
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

  // Followers (PK [deal_id, user_id]): move only users not already following the target, drop rest.
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
