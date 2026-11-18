import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  activities,
  deals,
  emailMessages,
  emailThreads,
  organizations,
  persons,
  pipelines,
} from "@/db/schema";
import { resolveActivityVisibility } from "@/features/activities/visibility";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSeeEmail } from "@/features/email/emailVisibility";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser, VisiblePersonOrOrg } from "@/features/permissions/types";

export async function canActorAccessParent(
  db: Db,
  actor: AuthUser,
  entityType: string,
  entityId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  switch (entityType) {
    case "deal":
      return canSeeDealParent(db, actor, entityId, signal);
    case "person":
      return canSeePersonOrOrg(db, actor, "person", entityId, signal);
    case "organization":
      return canSeePersonOrOrg(db, actor, "organization", entityId, signal);
    case "activity":
      return canSeeActivityParent(db, actor, entityId, signal);
    case "email_message":
      return canSeeEmailParent(db, actor, entityId, signal);
    default:
      return false;
  }
}

async function canSeeDealParent(
  db: Db,
  actor: AuthUser,
  dealId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [row] = await db
    .select({ deal: deals, pipelineVg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt), eq(pipelines.isArchived, false)));
  signal.throwIfAborted();
  if (row === undefined) return false;
  return canSee(actor, toVisibleDeal(row.deal, row.pipelineVg));
}

async function canSeePersonOrOrg(
  db: Db,
  actor: AuthUser,
  kind: "person" | "organization",
  id: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (kind === "person") {
    const [row] = await db
      .select()
      .from(persons)
      .where(and(eq(persons.id, id), isNull(persons.deletedAt)));
    signal.throwIfAborted();
    if (row === undefined) return false;
    return canSee(actor, toVisibleRecord("person", row));
  }
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
  signal.throwIfAborted();
  if (row === undefined) return false;
  return canSee(actor, toVisibleRecord("organization", row));
}

function toVisibleRecord(
  kind: "person" | "organization",
  row: {
    ownerId: string | null;
    visibilityLevel: VisiblePersonOrOrg["visibilityLevel"];
    visibilityGroupId: string | null;
    visibleToUserIds: readonly string[];
  },
): VisiblePersonOrOrg {
  return {
    kind,
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  };
}

async function canSeeActivityParent(
  db: Db,
  actor: AuthUser,
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
  return canSee(actor, vis);
}

export async function canSeeEmailParent(
  db: Db,
  actor: AuthUser,
  messageId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [message] = await db
    .select({ threadId: emailMessages.threadId })
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId));
  signal.throwIfAborted();
  if (message === undefined) return false;

  const [thread] = await db
    .select({
      accountId: emailThreads.accountId,
      visibility: emailThreads.visibility,
      dealId: emailThreads.dealId,
      personId: emailThreads.personId,
    })
    .from(emailThreads)
    .where(eq(emailThreads.id, message.threadId));
  signal.throwIfAborted();
  if (thread === undefined) return false;

  return canSeeEmail(db, actor, thread, signal);
}
