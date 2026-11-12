import type { FilterDefinition } from "@/features/saved-filters/schemas";
import {
  type DrillDown,
  parseDrillDown,
  resolveDrillDownOwner,
  type SearchParams,
} from "@/features/stats/drillDown";
import { type BoardViewState, DEFAULT_BOARD_VIEW } from "./boardView";

type Condition = FilterDefinition["conditions"][number];

export function wonDealsDrillDownView(drill: DrillDown, actorId: string): BoardViewState {
  const ownerId = resolveDrillDownOwner(drill.owner, actorId);
  const conditions: Condition[] = [
    { field: "status", op: "eq", value: "won" },
    { field: "wonTime", op: "gte", value: drill.from },
    { field: "wonTime", op: "lte", value: drill.to },
  ];
  if (ownerId !== null) conditions.push({ field: "ownerId", op: "eq", value: ownerId });
  return { ...DEFAULT_BOARD_VIEW, conditions: { combinator: "and", conditions } };
}

export function wonDealsDrillDownSeed(
  params: SearchParams,
  actorId: string,
  pipelineId: string,
): BoardViewState | null {
  const drill = parseDrillDown(params, "won");
  if (drill === null || drill.pipelineId !== pipelineId) return null;
  return wonDealsDrillDownView(drill, actorId);
}
