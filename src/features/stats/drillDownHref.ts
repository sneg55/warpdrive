import {
  ACTIVITIES_LIST_PATH,
  DRILL_DOWN_OWNER_ALL,
  DRILL_DOWN_OWNER_ME,
  DRILL_DOWN_PARAM,
  type DrillDownKind,
  pipelineListPath,
} from "@/constants/drillDown";
import type { OwnerScope } from "@/types/stats";

export interface DrillDownSource {
  owner: OwnerScope;
  pipelineId: string | null;
  from: string;
  to: string;
}

function ownerToken(owner: OwnerScope): string | null {
  switch (owner.kind) {
    case "me":
      return DRILL_DOWN_OWNER_ME;
    case "all":
      return DRILL_DOWN_OWNER_ALL;
    case "user":
      return owner.userId;
    case "team":
      return null;
  }
}

function drillDownHref(path: string, kind: DrillDownKind, source: DrillDownSource): string | null {
  const owner = ownerToken(source.owner);
  if (owner === null) return null;
  const params = new URLSearchParams({
    [DRILL_DOWN_PARAM.kind]: kind,
    [DRILL_DOWN_PARAM.owner]: owner,
    [DRILL_DOWN_PARAM.from]: source.from,
    [DRILL_DOWN_PARAM.to]: source.to,
  });
  if (source.pipelineId !== null) params.set(DRILL_DOWN_PARAM.pipeline, source.pipelineId);
  return `${path}?${params.toString()}`;
}

export function buildCompletedActivitiesHref(source: DrillDownSource): string | null {
  return drillDownHref(ACTIVITIES_LIST_PATH, "completed", source);
}

export function buildWonDealsHref(source: DrillDownSource): string | null {
  if (source.pipelineId === null) return null;
  return drillDownHref(pipelineListPath(source.pipelineId), "won", source);
}
