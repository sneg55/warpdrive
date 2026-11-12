import {
  type DrillDown,
  parseDrillDown,
  resolveDrillDownOwner,
  type SearchParams,
} from "@/features/stats/drillDown";
import type { ActivityListFilter } from "./schemas";

export interface ActivitiesDrillDownSeed {
  filter: ActivityListFilter;
  pipelineName: string | null;
}

export function completedActivitiesFilter(drill: DrillDown, actorId: string): ActivityListFilter {
  return {
    ownerId: resolveDrillDownOwner(drill.owner, actorId),
    done: "done",
    from: drill.from,
    to: drill.to,
    dateBasis: "done",
    pipelineId: drill.pipelineId,
    typeKey: null,
  };
}

export function activitiesDrillDownSeed(
  params: SearchParams,
  actorId: string,
  pipelines: readonly { id: string; name: string }[],
): ActivitiesDrillDownSeed | null {
  const drill = parseDrillDown(params, "completed");
  if (drill === null) return null;
  const pipelineName =
    drill.pipelineId === null
      ? null
      : (pipelines.find((p) => p.id === drill.pipelineId)?.name ?? null);
  return { filter: completedActivitiesFilter(drill, actorId), pipelineName };
}
