import type { VisibilityLevel } from "@/constants/visibility";
import type { VisibleActivity } from "@/features/permissions/types";

interface ParentVisibility {
  ownerId: string;
  visibilityLevel: VisibilityLevel;
  visibilityGroupId: string | null;
  visibleToUserIds: string[];
}

interface DealParentVisibility extends ParentVisibility {
  pipelineVisibilityGroupId: string | null;
  pipelineArchived: boolean;
}

export interface ActivityVisibilityInput {
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
  assigneeId: string;
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
