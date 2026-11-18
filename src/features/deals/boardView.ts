import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { BoardSortKey, SortDirection } from "./boardSort";
import { DEFAULT_SORT_DIRECTION, DEFAULT_SORT_KEY } from "./boardSort";
import type { SavedFilterView } from "./savedFilterView";

export interface BoardViewState {
  ownerId: string | null;
  sortKey: BoardSortKey;
  sortDir: SortDirection;
  savedFilter: SavedFilterView | null;
  conditions: FilterDefinition | null;
}

export const DEFAULT_BOARD_VIEW: BoardViewState = {
  ownerId: null,
  sortKey: DEFAULT_SORT_KEY,
  sortDir: DEFAULT_SORT_DIRECTION,
  savedFilter: null,
  conditions: null,
};

export interface BoardViewPref {
  ownerId: string | null;
  sortKey: BoardSortKey;
  sortDir: SortDirection;
  savedFilterId: string | null;
  conditions: FilterDefinition | null;
}

export function toBoardViewPref(view: BoardViewState): BoardViewPref {
  return {
    ownerId: view.ownerId,
    sortKey: view.sortKey,
    sortDir: view.sortDir,
    savedFilterId: view.savedFilter?.id ?? null,
    conditions: view.conditions,
  };
}

export function boardViewFromPref(
  stored: BoardViewPref | undefined,
  visibleFilters: readonly SavedFilterView[],
): BoardViewState {
  if (stored === undefined) return DEFAULT_BOARD_VIEW;
  const savedFilter =
    stored.savedFilterId === null
      ? null
      : (visibleFilters.find((f) => f.id === stored.savedFilterId) ?? null);
  return {
    ownerId: stored.ownerId,
    sortKey: stored.sortKey,
    sortDir: stored.sortDir,
    savedFilter,
    conditions: stored.conditions,
  };
}

export function isBoardFiltered(view: BoardViewState): boolean {
  return view.ownerId !== null || view.savedFilter !== null || view.conditions !== null;
}

export function boardViewDefinition(view: BoardViewState): FilterDefinition | undefined {
  return view.conditions ?? view.savedFilter?.definition;
}
