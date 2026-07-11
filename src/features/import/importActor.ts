import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/identity";
import type { PermSetUser } from "@/features/permissions/effective";
import { hydrateActor } from "@/server/hydrateActor";
import type { ImportActor } from "./commit";

// ImportActor adds primaryVisibilityGroupId to the PermSetUser. The COMMIT path (loadImportActor,
// below) must pass the user's REAL group: when the org's default deal/lead visibility is "group",
// createLead/createDeal reject with E_PERM_003 unless the actor carries a resolvable primary group,
// so hardcoding null failed every lead/deal import for such orgs. The request-path read callers
// (list/get/setMapping ownership gating) never create an entity, so they keep the default null
// rather than paying a redundant lookup per read.
export function toImportActor(
  actor: PermSetUser,
  primaryVisibilityGroupId: string | null = null,
): ImportActor {
  return { ...actor, primaryVisibilityGroupId };
}

// Rebuild the batch creator's import actor inside a background job (no request context).
export async function loadImportActor(
  db: Db,
  userId: string,
  signal: AbortSignal,
): Promise<ImportActor | null> {
  const actor = await hydrateActor(db, userId, signal);
  if (actor === null) return null;
  const [urow] = await db
    .select({ primaryGroup: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, userId));
  signal.throwIfAborted();
  return toImportActor(actor, urow?.primaryGroup ?? null);
}
