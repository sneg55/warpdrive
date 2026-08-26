import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { BoardSortKey, SortDirection } from "./boardSort";
import { DEFAULT_SORT_DIRECTION, DEFAULT_SORT_KEY } from "./boardSort";
import type { SavedFilterView } from "./savedFilterView";

// The board toolbar's view state: who the board is narrowed to (owner, saved view, ad-hoc
// conditions) and how each column is ordered. The pipeline is NOT here: it identifies which board
// you are on and lives in the URL, so it stays shareable and works with the back button.
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

// Wire shape stored in user_preferences.ui.boardView. A saved view travels as its id so a renamed,
// re-shared or deleted filter is resolved against the live rows on the next load.
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

// Rebuilds the runtime view from the stored preference. The stored saved-filter id is resolved
// against the filters the actor can currently see; an unresolvable id (deleted, unshared) is
// dropped rather than leaving the board pointing at a filter it cannot apply.
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

// True when any of the three narrowing dimensions is applied. The owner picker counts: a board
// narrowed to one person is filtered even with no saved view and no ad-hoc conditions.
export function isBoardFiltered(view: BoardViewState): boolean {
  return view.ownerId !== null || view.savedFilter !== null || view.conditions !== null;
}

// The filter definition the board query must apply, matching the precedence the client uses:
// ad-hoc conditions win over the saved view.
export function boardViewDefinition(view: BoardViewState): FilterDefinition | undefined {
  return view.conditions ?? view.savedFilter?.definition;
}
