import type { VisibilityLevel } from "@/constants/visibility";
import type { VisibleActivity } from "@/features/permissions/types";

// Parent visibility fields pre-fetched via join, so a list can resolve activity visibility in
// memory instead of re-querying each parent per row (the N+1 the DB resolver in visibility.ts
// incurs). Same dominant-parent precedence, kept pure so it is cheap to unit-test.
export interface ParentVisibility {
  ownerId: string;
  visibilityLevel: VisibilityLevel;
  visibilityGroupId: string | null;
  visibleToUserIds: string[];
}

export interface DealParentVisibility extends ParentVisibility {
  pipelineVisibilityGroupId: string | null;
  pipelineArchived: boolean;
}

export interface ActivityVisibilityInput {
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  assigneeId: string;
  // null when the id above is set but the parent row is missing or soft-deleted (deal also null
  // when its pipeline row is missing): both mean "not visible" under dominant-parent precedence.
  deal: DealParentVisibility | null;
  person: ParentVisibility | null;
  org: ParentVisibility | null;
  participantUserIds: string[];
}

function contactVisibility(p: ParentVisibility, assigneeId: string): VisibleActivity {
  return {
    kind: "activity",
    ownerId: p.ownerId,
    visibilityLevel: p.visibilityLevel,
    visibilityGroupId: p.visibilityGroupId,
    visibleToUserIds: p.visibleToUserIds,
    pipelineVisibilityGroupId: null,
    assigneeId,
  };
}

// Pure equivalent of resolveActivityVisibility for a row whose parents were pre-fetched via join.
// Same dominant-parent precedence (deal > person > org > parentless); an id set with a null parent
// record means the parent is missing/soft-deleted (or the deal's pipeline is gone) -> not visible.
export function activityVisibilityFromParents(
  input: ActivityVisibilityInput,
): VisibleActivity | null {
  if (input.dealId !== null) {
    if (input.deal === null || input.deal.pipelineArchived) return null;
    return {
      kind: "activity",
      ownerId: input.deal.ownerId,
      visibilityLevel: input.deal.visibilityLevel,
      visibilityGroupId: input.deal.visibilityGroupId,
      visibleToUserIds: input.deal.visibleToUserIds,
      pipelineVisibilityGroupId: input.deal.pipelineVisibilityGroupId,
      assigneeId: input.assigneeId,
    };
  }
  if (input.personId !== null) {
    return input.person === null ? null : contactVisibility(input.person, input.assigneeId);
  }
  if (input.orgId !== null) {
    return input.org === null ? null : contactVisibility(input.org, input.assigneeId);
  }
  return {
    kind: "activity",
    ownerId: null,
    visibilityLevel: "owner",
    visibilityGroupId: null,
    visibleToUserIds: [input.assigneeId, ...input.participantUserIds],
    pipelineVisibilityGroupId: null,
    assigneeId: input.assigneeId,
  };
}

function contactParent(
  ownerId: string | null,
  level: VisibilityLevel | null,
  groupId: string | null,
  visibleTo: string[] | null,
): ParentVisibility | null {
  if (ownerId === null || level === null) return null;
  return {
    ownerId,
    visibilityLevel: level,
    visibilityGroupId: groupId,
    visibleToUserIds: visibleTo ?? [],
  };
}

// The nullable parent columns a list query selects via LEFT JOIN (soft-deleted parents excluded by
// the join predicate, so a null column means "no visible parent"). Both the table and the calendar
// select these exact aliases and hand the row to buildActivityVisibility.
export interface ActivityParentColumns {
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  assigneeId: string;
  dealOwnerId: string | null;
  dealLevel: VisibilityLevel | null;
  dealGroupId: string | null;
  dealVisibleTo: string[] | null;
  pipelineVg: string | null;
  pipelineArchived: boolean | null;
  personOwnerId: string | null;
  personLevel: VisibilityLevel | null;
  personGroupId: string | null;
  personVisibleTo: string[] | null;
  orgOwnerId: string | null;
  orgLevel: VisibilityLevel | null;
  orgGroupId: string | null;
  orgVisibleTo: string[] | null;
}

// Resolve visibility from a joined row + pre-fetched participants (no per-row DB round-trip).
export function buildActivityVisibility(
  cols: ActivityParentColumns,
  participantUserIds: string[],
): VisibleActivity | null {
  const deal: DealParentVisibility | null =
    cols.dealOwnerId !== null && cols.dealLevel !== null && cols.pipelineArchived !== null
      ? {
          ownerId: cols.dealOwnerId,
          visibilityLevel: cols.dealLevel,
          visibilityGroupId: cols.dealGroupId,
          visibleToUserIds: cols.dealVisibleTo ?? [],
          pipelineVisibilityGroupId: cols.pipelineVg,
          pipelineArchived: cols.pipelineArchived,
        }
      : null;
  return activityVisibilityFromParents({
    dealId: cols.dealId,
    personId: cols.personId,
    orgId: cols.orgId,
    assigneeId: cols.assigneeId,
    deal,
    person: contactParent(
      cols.personOwnerId,
      cols.personLevel,
      cols.personGroupId,
      cols.personVisibleTo,
    ),
    org: contactParent(cols.orgOwnerId, cols.orgLevel, cols.orgGroupId, cols.orgVisibleTo),
    participantUserIds,
  });
}
