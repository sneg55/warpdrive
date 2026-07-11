import { CHANGE_FIELD_STAGE_ID } from "@/constants/changeLogFields";
import type { ChangeLogEntry } from "@/features/collaboration/changeLog";

// changeStage/moveDeal log stage transitions as `field: "stageId"` with stage-ID
// values in old/new. The renderer wants NAMES, so the read layer (which holds the
// pipeline's stages) rewrites old/new to names before building the timeline.
export const REMOVED_STAGE_LABEL = "(removed stage)";

export function resolveStageChangeNames(
  changelog: ChangeLogEntry[],
  stageNameById: Map<string, string>,
): ChangeLogEntry[] {
  return changelog.map((c) => {
    if (c.field !== CHANGE_FIELD_STAGE_ID) return c;
    return {
      ...c,
      oldValue: nameFor(c.oldValue, stageNameById),
      newValue: nameFor(c.newValue, stageNameById),
    };
  });
}

// A stage id that no longer resolves (a since-deleted stage) shows a friendly label rather than a
// raw UUID. Moves are always within the deal's pipeline (moveDeal rejects cross-pipeline), so the
// only unresolved case is a deleted stage.
function nameFor(value: unknown, stageNameById: Map<string, string>): unknown {
  if (typeof value !== "string") return value;
  return stageNameById.get(value) ?? REMOVED_STAGE_LABEL;
}
