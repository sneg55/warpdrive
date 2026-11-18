import type { VisibilityLevel } from "@/constants/visibility";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser, VisibleRecord } from "@/features/permissions/types";

export interface LinkedParentColumns {
  ownerId: string | null;
  level: VisibilityLevel | null;
  groupId: string | null;
  visibleTo: string[] | null;
}

export function linkedParentVisible(
  actor: AuthUser,
  kind: "person" | "organization" | "lead",
  visibleId: string | null,
  cols: LinkedParentColumns,
): boolean {
  if (visibleId === null || cols.level === null) return false;
  const base = {
    ownerId: cols.ownerId,
    visibilityLevel: cols.level,
    visibilityGroupId: cols.groupId,
    visibleToUserIds: cols.visibleTo ?? [],
  };
  const record: VisibleRecord =
    kind === "lead"
      ? { kind: "deal", ...base, pipelineVisibilityGroupId: null }
      : { kind, ...base };
  return canSee(actor, record);
}
