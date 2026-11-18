import { CHANGE_FIELD_STAGE_ID } from "@/constants/changeLogFields";
import type { ChangeLogEntry } from "@/features/collaboration/changeLog";

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

function nameFor(value: unknown, stageNameById: Map<string, string>): unknown {
  if (typeof value !== "string") return value;
  return stageNameById.get(value) ?? REMOVED_STAGE_LABEL;
}
