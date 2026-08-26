"use client";
import { useState } from "react";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { BoardSortKey } from "./boardSort";
import { type BoardViewState, DEFAULT_BOARD_VIEW } from "./boardView";
import type { SavedFilterView } from "./savedFilterView";
import { useBoardViewPersist } from "./useBoardViewPersist";

export interface BoardViewControls extends BoardViewState {
  setOwnerId: (ownerId: string | null) => void;
  setSortKey: (key: BoardSortKey) => void;
  toggleSortDirection: () => void;
  setSavedFilter: (filter: SavedFilterView | null) => void;
  setConditions: (definition: FilterDefinition | null) => void;
  // Resets all three narrowing dimensions at once. Sort order is not one of them, so it survives.
  clearFilters: () => void;
}

// Owns the board toolbar's view state and keeps it in the user's preferences, so a reload restores
// the same owner, filter and column order. Seeded from the server-read preference.
export function useBoardView(initial: BoardViewState | undefined): BoardViewControls {
  const seed = initial ?? DEFAULT_BOARD_VIEW;
  const [ownerId, setOwnerId] = useState<string | null>(seed.ownerId);
  const [sortKey, setSortKey] = useState<BoardSortKey>(seed.sortKey);
  const [sortDir, setSortDir] = useState(seed.sortDir);
  const [savedFilter, setSavedFilter] = useState<SavedFilterView | null>(seed.savedFilter);
  const [conditions, setConditions] = useState<FilterDefinition | null>(seed.conditions);

  const view: BoardViewState = { ownerId, sortKey, sortDir, savedFilter, conditions };
  useBoardViewPersist(view);

  return {
    ...view,
    setOwnerId,
    setSortKey,
    toggleSortDirection: () => setSortDir((d) => (d === "asc" ? "desc" : "asc")),
    setSavedFilter,
    setConditions,
    clearFilters: () => {
      setOwnerId(null);
      setSavedFilter(null);
      setConditions(null);
    },
  };
}
