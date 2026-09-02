import {
  type CustomFieldSortKey,
  customFieldKeyFromColumn,
  isCustomFieldSortKey,
} from "@/features/custom-fields/sortKey";
import { compareCustomFieldValues } from "@/features/custom-fields/sortValues";
import type { CustomFieldDef } from "@/types/customFields";
import { type BoardSortKey, type SortDirection, sortBoardCards } from "./boardSort";
import type { DealListRow } from "./dealListTypes";
import type { BoardCard } from "./dealRepo";

export type DealListSortKey = BoardSortKey | CustomFieldSortKey;

export function sortRows(
  rows: DealListRow[],
  key: DealListSortKey,
  dir: SortDirection,
  defs: readonly CustomFieldDef[],
): DealListRow[] {
  if (isCustomFieldSortKey(key)) {
    const cfKey = customFieldKeyFromColumn(key);
    const def = defs.find((d) => d.key === cfKey);
    if (def === undefined) return rows;
    return [...rows].sort(
      (a, b) =>
        compareCustomFieldValues(def, a.customFields[def.key], b.customFields[def.key], dir) ||
        a.id.localeCompare(b.id),
    );
  }
  const asCards: BoardCard[] = rows.map((r) => ({ ...r, updatedAt: new Date(r.updatedAt) }));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  return sortBoardCards(asCards, key, dir).flatMap((c) => {
    const found = rowById.get(c.id);
    return found ? [found] : [];
  });
}
