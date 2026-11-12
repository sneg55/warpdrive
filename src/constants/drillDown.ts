export const DRILL_DOWN_PARAM = {
  kind: "drill",
  owner: "owner",
  from: "from",
  to: "to",
  pipeline: "pipeline",
} as const;

export const DRILL_DOWN_KINDS = ["completed", "won"] as const;
export type DrillDownKind = (typeof DRILL_DOWN_KINDS)[number];

export const DRILL_DOWN_OWNER_ME = "me";
export const DRILL_DOWN_OWNER_ALL = "all";

export const ACTIVITIES_LIST_PATH = "/activities/list";

export function pipelineListPath(pipelineId: string): string {
  return `/pipeline/${pipelineId}/list`;
}
