// Org-to-org "Related organizations" repo (Wave 3, Task 23). Storage is directional
// (source -> target, one row); listRelatedOrgs reads both directions so a relation shows on
// both orgs' pages symmetrically. A relation is shared, org-wide-visible data (unlike
// dealFollowers' self-scoped per-user opt-in, src/features/deal-workspace/followers.ts), so
// mutations require canSee on both orgs (you cannot link to an org you cannot even see) AND
// contact.edit on the source org, mirroring the edit-capability gate updateOrg/deleteOrg use
// in orgsRepo.ts (visibility alone is not authority to mutate). Add also dedupes an existing
// relation in EITHER direction before insert, since the composite PK only dedupes the exact
// ordered (source, target) pair and would otherwise let (A,B) and (B,A) coexist as distinct
// rows, double-listing the same org.
import { and, eq, isNull, or } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizationRelations, organizations } from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import type { AddOrgRelationInput, RemoveOrgRelationInput } from "./schemas";

export interface RelatedOrg {
  orgId: string;
  name: string;
  relationType: string;
}

function toVisible(row: {
  ownerId: string;
  visibilityLevel: VisiblePersonOrOrg["visibilityLevel"];
  visibilityGroupId: string | null;
  visibleToUserIds: readonly string[];
}): VisiblePersonOrOrg {
  return {
    kind: "organization",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  };
}

// Load an org row and confirm the actor can see it (404-shaped like getOrg/assertVisible in
// followers.ts, so a relation attempt cannot be used to probe for a hidden org's existence).
// Returns the visibility projection (not void) so callers can reuse it for the contact.edit
// capability check without a second query.
async function assertOrgVisible(
  db: Db,
  actor: PermSetUser,
  orgId: string,
  signal: AbortSignal,
): Promise<Result<VisiblePersonOrOrg, AppError>> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
  if (row === undefined || !canSee(actor, toVisible(row))) {
    return err(
      new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "org not found or not visible", { orgId }),
    );
  }
  signal.throwIfAborted();
  return ok(toVisible(row));
}

export async function addOrgRelation(
  db: Db,
  actor: PermSetUser,
  input: AddOrgRelationInput,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();

  if (input.sourceOrgId === input.targetOrgId) {
    return err(
      new AppError(ERROR_IDS.CONTACT_RELATION_SELF, "an org cannot relate to itself", {
        orgId: input.sourceOrgId,
      }),
    );
  }

  const source = await assertOrgVisible(db, actor, input.sourceOrgId, signal);
  if (!source.ok) return source;
  const target = await assertOrgVisible(db, actor, input.targetOrgId, signal);
  if (!target.ok) return target;

  // Edit capability gate: visibility alone is not authority to mutate (mirrors updateOrg's
  // canSee-then-contact.edit gate in orgsRepo.ts). Checked before the dedup lookup below so a
  // caller without contact.edit is denied even when a relation already exists for this pair.
  if (!can(actor, "contact.edit", source.value)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { orgId: input.sourceOrgId }),
    );
  }

  // Dedupe both directions: the composite PK only rejects the exact ordered (source, target)
  // pair, so without this check (A,B) and (B,A) could both exist as distinct rows for the same
  // org pair, and listRelatedOrgs (which unions asSource+asTarget) would return the org twice.
  // No-op (keep the existing row/label) if a relation already exists in either direction.
  const [existing] = await db
    .select({ sourceOrgId: organizationRelations.sourceOrgId })
    .from(organizationRelations)
    .where(
      or(
        and(
          eq(organizationRelations.sourceOrgId, input.sourceOrgId),
          eq(organizationRelations.targetOrgId, input.targetOrgId),
        ),
        and(
          eq(organizationRelations.sourceOrgId, input.targetOrgId),
          eq(organizationRelations.targetOrgId, input.sourceOrgId),
        ),
      ),
    );
  signal.throwIfAborted();
  if (existing !== undefined) return ok(undefined);

  // Idempotent: re-adding the same (source, target) pair is a no-op (composite PK conflict).
  await db
    .insert(organizationRelations)
    .values({
      sourceOrgId: input.sourceOrgId,
      targetOrgId: input.targetOrgId,
      relationType: input.relationType,
    })
    .onConflictDoNothing();
  signal.throwIfAborted();
  return ok(undefined);
}

export async function removeOrgRelation(
  db: Db,
  actor: PermSetUser,
  input: RemoveOrgRelationInput,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();

  const source = await assertOrgVisible(db, actor, input.sourceOrgId, signal);
  if (!source.ok) return source;
  const target = await assertOrgVisible(db, actor, input.targetOrgId, signal);
  if (!target.ok) return target;

  // Same edit capability gate as addOrgRelation: visibility alone is not authority to mutate.
  if (!can(actor, "contact.edit", source.value)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { orgId: input.sourceOrgId }),
    );
  }

  // Delete whichever direction the row was actually stored in: the caller (a panel mounted
  // on either org's page) does not necessarily know which side was the original source.
  // Idempotent: removing an absent relation deletes zero rows and still succeeds.
  await db
    .delete(organizationRelations)
    .where(
      or(
        and(
          eq(organizationRelations.sourceOrgId, input.sourceOrgId),
          eq(organizationRelations.targetOrgId, input.targetOrgId),
        ),
        and(
          eq(organizationRelations.sourceOrgId, input.targetOrgId),
          eq(organizationRelations.targetOrgId, input.sourceOrgId),
        ),
      ),
    );
  signal.throwIfAborted();
  return ok(undefined);
}

export async function listRelatedOrgs(
  db: Db,
  actor: PermSetUser,
  orgId: string,
  signal: AbortSignal,
): Promise<RelatedOrg[]> {
  signal.throwIfAborted();

  // No-leak precondition: an actor who cannot see the anchor org itself gets an empty list,
  // same as contactTimeline's assertReferenceVisible gate.
  const anchor = await assertOrgVisible(db, actor, orgId, signal);
  if (!anchor.ok) return [];

  const projection = {
    orgId: organizations.id,
    name: organizations.name,
    relationType: organizationRelations.relationType,
    ownerId: organizations.ownerId,
    visibilityLevel: organizations.visibilityLevel,
    visibilityGroupId: organizations.visibilityGroupId,
    visibleToUserIds: organizations.visibleToUserIds,
  };

  const asSource = await db
    .select(projection)
    .from(organizationRelations)
    .innerJoin(organizations, eq(organizations.id, organizationRelations.targetOrgId))
    .where(and(eq(organizationRelations.sourceOrgId, orgId), isNull(organizations.deletedAt)));

  const asTarget = await db
    .select(projection)
    .from(organizationRelations)
    .innerJoin(organizations, eq(organizations.id, organizationRelations.sourceOrgId))
    .where(and(eq(organizationRelations.targetOrgId, orgId), isNull(organizations.deletedAt)));

  signal.throwIfAborted();

  return [...asSource, ...asTarget]
    .filter((row) => canSee(actor, toVisible(row)))
    .map((row) => ({ orgId: row.orgId, name: row.name, relationType: row.relationType }));
}
