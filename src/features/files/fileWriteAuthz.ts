import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activities, deals, organizations, persons, pipelines } from "@/db/schema";
import { resolveActivityVisibility } from "@/features/activities/visibility";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { canSeeEmailParent } from "./fileAuthz";

export async function canActorModifyParent(
  db: Db,
  actor: PermSetUser,
  entityType: string,
  entityId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  switch (entityType) {
    case "deal":
      return canModifyDeal(db, actor, entityId, signal);
    case "person":
      return canModifyPerson(db, actor, entityId, signal);
    case "organization":
      return canModifyOrg(db, actor, entityId, signal);
    case "activity":
      return canModifyActivity(db, actor, entityId, signal);
    case "email_message":
      return canSeeEmailParent(db, actor, entityId, signal);
    default:
      return false;
  }
}

async function canModifyDeal(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [row] = await db
    .select({ deal: deals, vg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt), eq(pipelines.isArchived, false)));
  signal.throwIfAborted();
  if (row === undefined) return false;
  return can(actor, "deal.edit", toVisibleDeal(row.deal, row.vg));
}

async function canModifyPerson(
  db: Db,
  actor: PermSetUser,
  id: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, id), isNull(persons.deletedAt)));
  signal.throwIfAborted();
  if (row === undefined) return false;
  const rec: VisiblePersonOrOrg = {
    kind: "person",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId ?? null,
    visibleToUserIds: row.visibleToUserIds,
  };
  return can(actor, "contact.edit", rec);
}

async function canModifyOrg(
  db: Db,
  actor: PermSetUser,
  id: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
  signal.throwIfAborted();
  if (row === undefined) return false;
  const rec: VisiblePersonOrOrg = {
    kind: "organization",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId ?? null,
    visibleToUserIds: row.visibleToUserIds,
  };
  return can(actor, "contact.edit", rec);
}

async function canModifyActivity(
  db: Db,
  actor: PermSetUser,
  activityId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)));
  signal.throwIfAborted();
  if (activity === undefined) return false;
  const vis = await resolveActivityVisibility(db, activity, signal);
  if (vis === null) return false;
  return can(actor, "activity.edit", vis);
}
