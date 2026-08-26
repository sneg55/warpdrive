import type { VisibilityLevel } from "@/constants/visibility";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser, VisibleRecord } from "@/features/permissions/types";

// The nullable visibility columns a LEFT JOIN pulls for a linked parent.
export interface LinkedParentColumns {
  ownerId: string | null;
  level: VisibilityLevel | null;
  groupId: string | null;
  visibleTo: string[] | null;
}

// Whether the actor may be told this linked parent exists. An activity is authorized through its
// DOMINANT parent, which says nothing about the secondary records hanging off it, so naming one or
// linking to it is a separate check. A null id means the parent is absent or soft-deleted.
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
  // A lead follows the deal rules with no pipeline to gate on, which is exactly what
  // leads/visibility.ts encodes in SQL.
  const record: VisibleRecord =
    kind === "lead"
      ? { kind: "deal", ...base, pipelineVisibilityGroupId: null }
      : { kind, ...base };
  return canSee(actor, record);
}
