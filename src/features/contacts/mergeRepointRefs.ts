import { and, eq, notInArray } from "drizzle-orm";
import { contactFollowers, emailThreads, leads, prospectReveals } from "@/db/schema";
import type { Tx } from "./mergeHelpers";

type ContactEntityType = "person" | "organization";

async function repointFollowers(
  tx: Tx,
  entityType: ContactEntityType,
  survivorId: string,
  mergedId: string,
): Promise<void> {
  const ofEntity = (id: string) =>
    and(eq(contactFollowers.entityType, entityType), eq(contactFollowers.entityId, id));
  await tx
    .update(contactFollowers)
    .set({ entityId: survivorId })
    .where(
      and(
        ofEntity(mergedId),
        notInArray(
          contactFollowers.userId,
          tx
            .select({ userId: contactFollowers.userId })
            .from(contactFollowers)
            .where(ofEntity(survivorId)),
        ),
      ),
    );
  await tx.delete(contactFollowers).where(ofEntity(mergedId));
}

export async function repointPersonRefs(
  tx: Tx,
  survivorId: string,
  mergedId: string,
): Promise<void> {
  await tx.update(leads).set({ personId: survivorId }).where(eq(leads.personId, mergedId));
  await tx
    .update(emailThreads)
    .set({ personId: survivorId })
    .where(eq(emailThreads.personId, mergedId));
  await tx
    .update(prospectReveals)
    .set({ personId: survivorId })
    .where(eq(prospectReveals.personId, mergedId));
  await repointFollowers(tx, "person", survivorId, mergedId);
}

export async function repointOrgRefs(tx: Tx, survivorId: string, mergedId: string): Promise<void> {
  await tx.update(leads).set({ orgId: survivorId }).where(eq(leads.orgId, mergedId));
  await tx
    .update(prospectReveals)
    .set({ orgId: survivorId })
    .where(eq(prospectReveals.orgId, mergedId));
  await repointFollowers(tx, "organization", survivorId, mergedId);
}
