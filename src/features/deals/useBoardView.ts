"use client";
import { useEffect, useState } from "react";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { BoardSortKey } from "./boardSort";
import { type BoardViewState, DEFAULT_BOARD_VIEW } from "./boardView";
import { recallBoardView, rememberBoardView } from "./boardViewMemory";
import type { SavedFilterView } from "./savedFilterView";
import { useBoardViewPersist } from "./useBoardViewPersist";

export interface BoardViewControls extends BoardViewState {
  restored: boolean;
  setOwnerId: (ownerId: string | null) => void;
  setSortKey: (key: BoardSortKey) => void;
  toggleSortDirection: () => void;
  setSavedFilter: (filter: SavedFilterView | null) => void;
  setConditions: (definition: FilterDefinition | null) => void;
  // Resets all three narrowing dimensions at once. Sort order is not one of them, so it survives.
  clearFilters: () => void;
}

export function useBoardView(initial: BoardViewState | undefined): BoardViewControls {
  const [restored] = useState(() => recallBoardView() !== null);
  const [seed] = useState(() => recallBoardView() ?? initial ?? DEFAULT_BOARD_VIEW);
  const [ownerId, setOwnerId] = useState<string | null>(seed.ownerId);
  const [sortKey, setSortKey] = useState<BoardSortKey>(seed.sortKey);
  const [sortDir, setSortDir] = useState(seed.sortDir);
  const [savedFilter, setSavedFilter] = useState<SavedFilterView | null>(seed.savedFilter);
  const [conditions, setConditions] = useState<FilterDefinition | null>(seed.conditions);

  const view: BoardViewState = { ownerId, sortKey, sortDir, savedFilter, conditions };
  useBoardViewPersist(view);
  useEffect(() => {
    rememberBoardView({ ownerId, sortKey, sortDir, savedFilter, conditions });
  }, [ownerId, sortKey, sortDir, savedFilter, conditions]);

  return {
    ...view,
    restored,
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
