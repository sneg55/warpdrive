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

  if (!can(actor, "contact.edit", source.value)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { orgId: input.sourceOrgId }),
    );
  }

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

  if (!can(actor, "contact.edit", source.value)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { orgId: input.sourceOrgId }),
    );
  }

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
