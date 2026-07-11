import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/identity";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DealVisibilitySession } from "@/types/session";
import type { ContactActor } from "./personsRepo";

// Build the DealVisibilitySession shape assertReferenceVisible expects. Shared by contactTimeline
// and activityStats so the entity-visibility gate is defined once (was duplicated per call site).
export function toRefActor(actor: PermSetUser): DealVisibilitySession {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

// Build the ContactActor shape personsRepo/orgsRepo expect from a PermSetUser. flags are carried
// through so contact update paths can enforce contact.edit (F2). primaryVisibilityGroupId defaults
// to null: read/update/delete paths never resolve a group, so they need not pay a lookup. The
// CREATE paths (createPerson/createOrg) MUST pass the real group via loadContactActor, or
// deriveContactVisibility rejects with E_PERM_003 whenever the person/org default visibility is
// "group" (mirrors the import-actor bug that failed every group-scoped lead import).
export function toContactActor(
  actor: PermSetUser,
  primaryVisibilityGroupId: string | null = null,
): ContactActor {
  return {
    id: actor.id,
    type: actor.type,
    isActive: actor.isActive,
    groupIds: actor.groupIds,
    flags: actor.flags,
    primaryVisibilityGroupId,
  };
}

// Create-path variant: load the actor's real primaryVisibilityGroupId (same source as
// leadServerActions/createDealAction) so a group-level person/org create can resolve its group.
export async function loadContactActor(
  db: Db,
  actor: PermSetUser,
  signal: AbortSignal,
): Promise<ContactActor> {
  const [urow] = await db
    .select({ primaryGroup: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, actor.id));
  signal.throwIfAborted();
  return toContactActor(actor, urow?.primaryGroup ?? null);
}
