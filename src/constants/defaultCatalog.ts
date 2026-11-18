import type { LabelColor, LabelTarget } from "./labelColors";

export const DEFAULT_PIPELINE = {
  name: "Sales Pipeline",
  stages: ["Qualified", "Contact made", "Demo Scheduled", "Negotiation", "Closing"],
} as const;

export function buildDefaultStageValues(
  pipelineId: string,
): { pipelineId: string; name: string; order: number }[] {
  return DEFAULT_PIPELINE.stages.map((name, order) => ({ pipelineId, name, order }));
}

export const DEFAULT_LABELS: Record<LabelTarget, ReadonlyArray<readonly [string, LabelColor]>> = {
  person: [
    ["Champion", "green"],
    ["Decision Maker", "purple"],
    ["Influencer", "blue"],
    ["Blocker", "red"],
    ["Gatekeeper", "orange"],
  ],
  organization: [
    ["Enterprise", "purple"],
    ["Mid-Market", "blue"],
    ["SMB", "teal"],
    ["Startup", "green"],
  ],
  deal: [
    ["Hot", "red"],
    ["Warm", "orange"],
    ["Cold", "blue"],
  ],
  lead: [
    ["New", "blue"],
    ["Working", "orange"],
    ["Qualified", "green"],
    ["Disqualified", "gray"],
  ],
};
