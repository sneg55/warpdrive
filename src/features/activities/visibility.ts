import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activityParticipants, deals, organizations, persons, pipelines } from "@/db/schema";
import type { Activity } from "@/db/schema/activities";
import type { VisibleActivity } from "@/features/permissions/types";
import type { DbOrTx } from "@/server/realtime/channelVersions";

// Parentless activities (no deal/person/org) are visible to their assignee + participants, so fetch
// those participants in one batched query keyed by activity id rather than per row. Used by the list
// and calendar paths, which resolve the rest of visibility in memory (see activityVisibility.ts).
export async function loadParentlessParticipants(
  db: Db,
  rows: { id: string; dealId: string | null; personId: string | null; orgId: string | null }[],
  signal: AbortSignal,
): Promise<Map<string, string[]>> {
  const parentlessIds = rows
    .filter((r) => r.dealId === null && r.personId === null && r.orgId === null)
    .map((r) => r.id);
  const byActivity = new Map<string, string[]>();
  if (parentlessIds.length === 0) return byActivity;
  const parts = await db
    .select({ activityId: activityParticipants.activityId, userId: activityParticipants.userId })
    .from(activityParticipants)
    .where(inArray(activityParticipants.activityId, parentlessIds));
  signal.throwIfAborted();
  for (const p of parts) {
    const list = byActivity.get(p.activityId) ?? [];
    list.push(p.userId);
    byActivity.set(p.activityId, list);
  }
  return byActivity;
}

// Resolve the visibility record for a single activity using dominant-parent precedence:
// deal > person > org > parentless. Returns null when the dominant parent is soft-deleted or
// missing (not visible). This is the per-activity DB path (completeActivity etc.); list rendering
// uses the in-memory buildActivityVisibility to avoid the per-row N+1 this incurs.
export async function resolveActivityVisibility(
  db: DbOrTx,
  activity: Activity,
  signal: AbortSignal,
): Promise<VisibleActivity | null> {
  signal.throwIfAborted();

  if (activity.dealId !== null) {
    return resolveDealParent(db, activity, activity.dealId, signal);
  }
  if (activity.personId !== null) {
    return resolvePersonParent(db, activity, activity.personId, signal);
  }
  if (activity.orgId !== null) {
    return resolveOrgParent(db, activity, activity.orgId, signal);
  }
  return resolveParentless(db, activity, signal);
}

async function resolveDealParent(
  db: DbOrTx,
  activity: Activity,
  dealId: string,
  signal: AbortSignal,
): Promise<VisibleActivity | null> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
  signal.throwIfAborted();
  if (deal === undefined) return null;

  const [pipe] = await db
    .select({ vg: pipelines.visibilityGroupId, isArchived: pipelines.isArchived })
    .from(pipelines)
    .where(eq(pipelines.id, deal.pipelineId));
  signal.throwIfAborted();
  // Missing pipeline: fail closed (same defense-in-depth as referenceCheck.ts). An archived
  // pipeline hides all its deals from reads (F7/F15/F16), so a deal-parented activity must be
  // hidden too (F22): return null so canSee/can never see it.
  if (pipe === undefined || pipe.isArchived) return null;

  return {
    kind: "activity",
    ownerId: deal.ownerId,
    visibilityLevel: deal.visibilityLevel,
    visibilityGroupId: deal.visibilityGroupId ?? null,
    visibleToUserIds: deal.visibleToUserIds,
    pipelineVisibilityGroupId: pipe.vg ?? null,
    assigneeId: activity.assigneeId,
  };
}

async function resolvePersonParent(
  db: DbOrTx,
  activity: Activity,
  personId: string,
  signal: AbortSignal,
): Promise<VisibleActivity | null> {
  const [person] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), isNull(persons.deletedAt)));
  signal.throwIfAborted();
  if (person === undefined) return null;

  return {
    kind: "activity",
    ownerId: person.ownerId,
    visibilityLevel: person.visibilityLevel,
    visibilityGroupId: person.visibilityGroupId ?? null,
    visibleToUserIds: person.visibleToUserIds,
    pipelineVisibilityGroupId: null,
    assigneeId: activity.assigneeId,
  };
}

async function resolveOrgParent(
  db: DbOrTx,
  activity: Activity,
  orgId: string,
  signal: AbortSignal,
): Promise<VisibleActivity | null> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
  signal.throwIfAborted();
  if (org === undefined) return null;

  return {
    kind: "activity",
    ownerId: org.ownerId,
    visibilityLevel: org.visibilityLevel,
    visibilityGroupId: org.visibilityGroupId ?? null,
    visibleToUserIds: org.visibleToUserIds,
    pipelineVisibilityGroupId: null,
    assigneeId: activity.assigneeId,
  };
}

async function resolveParentless(
  db: DbOrTx,
  activity: Activity,
  signal: AbortSignal,
): Promise<VisibleActivity> {
  const participants = await db
    .select({ userId: activityParticipants.userId })
    .from(activityParticipants)
    .where(eq(activityParticipants.activityId, activity.id));
  signal.throwIfAborted();

  const participantUserIds = participants.map((p) => p.userId);

  // Assignee + participants go into visibleToUserIds so canSee's additive-allow
  // rule yields exactly the parentless visibility spec: assignee/participant ONLY.
  // ownerId is null (not activity.ownerId): the parentless read rule grants NO
  // ownership-path visibility, matching the assignee/participant-only SQL predicate
  // (Task 13). This prevents a parentless activity reassigned away from its creator
  // from being "completable but invisible in lists" or vice versa.
  return {
    kind: "activity",
    ownerId: null,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [activity.assigneeId, ...participantUserIds],
    pipelineVisibilityGroupId: null,
    assigneeId: activity.assigneeId,
  };
}
