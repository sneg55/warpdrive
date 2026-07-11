import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import {
  activities,
  activityGuests,
  dealParticipants,
  deals,
  files,
  notes,
  orgLabels,
  personLabels,
  persons,
} from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";

export type MergeArgs = {
  survivorId: string;
  mergedId: string;
  fieldChoices: Record<string, unknown>;
};

// TRUST BOUNDARY (FIX 1): only `name` may be chosen from the client. .strip()
// drops everything else, so ownerId / visibility* / deletedAt / id can never
// reach the survivor UPDATE via fieldChoices.
export const fieldChoicesSchema = z.object({ name: z.string().min(1).max(255).optional() }).strip();

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type VisibleFields = {
  ownerId: string | null;
  visibilityLevel: VisiblePersonOrOrg["visibilityLevel"];
  visibilityGroupId: string | null;
  visibleToUserIds: readonly string[];
};

function toVisible(kind: "person" | "organization", row: VisibleFields): VisiblePersonOrOrg {
  return {
    kind,
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  };
}

// FIX 2: 404-on-invisible (canSee) BEFORE the 403 permission-flag check.
export function gateMerge(
  actor: PermSetUser,
  kind: "person" | "organization",
  survivor: VisibleFields,
  merged: VisibleFields,
  args: MergeArgs,
): Result<true, AppError> {
  const visS = toVisible(kind, survivor);
  const visM = toVisible(kind, merged);
  if (canSee(actor, visS) === false || canSee(actor, visM) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", args));
  }
  if (can(actor, "contact.merge", visS) === false || can(actor, "contact.merge", visM) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_MERGE_FORBIDDEN, "forbidden", args));
  }
  return ok(true);
}

// FIX 3: composite-PK collision-safe repoint. Repoint only rows that would NOT
// collide with an existing survivor row, then delete the colliding remainder.
export async function repointPersonFks(
  tx: Tx,
  survivorId: string,
  mergedId: string,
): Promise<void> {
  await tx
    .update(activities)
    .set({ personId: survivorId })
    .where(eq(activities.personId, mergedId));
  await tx.update(deals).set({ personId: survivorId }).where(eq(deals.personId, mergedId));

  await tx
    .update(dealParticipants)
    .set({ personId: survivorId })
    .where(
      and(
        eq(dealParticipants.personId, mergedId),
        notInArray(
          dealParticipants.dealId,
          tx
            .select({ dealId: dealParticipants.dealId })
            .from(dealParticipants)
            .where(eq(dealParticipants.personId, survivorId)),
        ),
      ),
    );
  await tx.delete(dealParticipants).where(eq(dealParticipants.personId, mergedId));

  await tx
    .update(activityGuests)
    .set({ personId: survivorId })
    .where(
      and(
        eq(activityGuests.personId, mergedId),
        notInArray(
          activityGuests.activityId,
          tx
            .select({ activityId: activityGuests.activityId })
            .from(activityGuests)
            .where(eq(activityGuests.personId, survivorId)),
        ),
      ),
    );
  await tx.delete(activityGuests).where(eq(activityGuests.personId, mergedId));

  await tx
    .update(notes)
    .set({ entityId: survivorId })
    .where(and(eq(notes.entityType, "person"), eq(notes.entityId, mergedId)));
  await tx
    .update(files)
    .set({ entityId: survivorId })
    .where(and(eq(files.entityType, "person"), eq(files.entityId, mergedId)));

  // person_labels (PK [person_id, label_id]) has the same collision shape as
  // deal_participants: merge soft-deletes, so the cascade FK never fires.
  await tx
    .update(personLabels)
    .set({ personId: survivorId })
    .where(
      and(
        eq(personLabels.personId, mergedId),
        notInArray(
          personLabels.labelId,
          tx
            .select({ labelId: personLabels.labelId })
            .from(personLabels)
            .where(eq(personLabels.personId, survivorId)),
        ),
      ),
    );
  await tx.delete(personLabels).where(eq(personLabels.personId, mergedId));
  // notifications.entity_id (polymorphic) is intentionally NOT repointed: no
  // Phase 3 path writes person/org-scoped notifications yet (review note F2);
  // revisit when such notifications are added.
}

export async function repointOrgFks(tx: Tx, survivorId: string, mergedId: string): Promise<void> {
  await tx.update(persons).set({ orgId: survivorId }).where(eq(persons.orgId, mergedId));
  await tx.update(deals).set({ orgId: survivorId }).where(eq(deals.orgId, mergedId));
  await tx.update(activities).set({ orgId: survivorId }).where(eq(activities.orgId, mergedId));
  await tx
    .update(notes)
    .set({ entityId: survivorId })
    .where(and(eq(notes.entityType, "organization"), eq(notes.entityId, mergedId)));
  await tx
    .update(files)
    .set({ entityId: survivorId })
    .where(and(eq(files.entityType, "organization"), eq(files.entityId, mergedId)));

  // org_labels (PK [org_id, label_id]): same collision-safe repoint as person_labels.
  await tx
    .update(orgLabels)
    .set({ orgId: survivorId })
    .where(
      and(
        eq(orgLabels.orgId, mergedId),
        notInArray(
          orgLabels.labelId,
          tx
            .select({ labelId: orgLabels.labelId })
            .from(orgLabels)
            .where(eq(orgLabels.orgId, survivorId)),
        ),
      ),
    );
  await tx.delete(orgLabels).where(eq(orgLabels.orgId, mergedId));
}
