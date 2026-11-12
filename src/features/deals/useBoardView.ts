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

export interface BoardViewOptions {
  fromDrillDown?: boolean;
}

function initialSeed(initial: BoardViewState | undefined, fromDrillDown: boolean): BoardViewState {
  const remembered = fromDrillDown ? null : recallBoardView();
  return remembered ?? initial ?? DEFAULT_BOARD_VIEW;
}

export function useBoardView(
  initial: BoardViewState | undefined,
  options: BoardViewOptions = {},
): BoardViewControls {
  const fromDrillDown = options.fromDrillDown === true;
  const [restored] = useState(() => !fromDrillDown && recallBoardView() !== null);
  const [seed] = useState(() => initialSeed(initial, fromDrillDown));
  const [ownerId, setOwnerId] = useState<string | null>(seed.ownerId);
  const [sortKey, setSortKey] = useState<BoardSortKey>(seed.sortKey);
  const [sortDir, setSortDir] = useState(seed.sortDir);
  const [savedFilter, setSavedFilter] = useState<SavedFilterView | null>(seed.savedFilter);
  const [conditions, setConditions] = useState<FilterDefinition | null>(seed.conditions);
  const [edited, setEdited] = useState(false);

  const view: BoardViewState = { ownerId, sortKey, sortDir, savedFilter, conditions };
  const untouchedDrillDown = fromDrillDown && !edited;
  function edit<T>(set: (value: T) => void): (value: T) => void {
    return (value) => {
      setEdited(true);
      set(value);
    };
  }
  useBoardViewPersist(view, untouchedDrillDown);
  useEffect(() => {
    if (untouchedDrillDown) return;
    rememberBoardView({ ownerId, sortKey, sortDir, savedFilter, conditions });
  }, [ownerId, sortKey, sortDir, savedFilter, conditions, untouchedDrillDown]);

  return {
    ...view,
    restored,
    setOwnerId: edit(setOwnerId),
    setSortKey: edit(setSortKey),
    toggleSortDirection: () => {
      setEdited(true);
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    },
    setSavedFilter: edit(setSavedFilter),
    setConditions: edit(setConditions),
    clearFilters: () => {
      setEdited(true);
      setOwnerId(null);
      setSavedFilter(null);
      setConditions(null);
    },
  };
}
