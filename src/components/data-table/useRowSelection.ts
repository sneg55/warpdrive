"use client";
import { useCallback, useMemo, useState } from "react";

// Pure selection helpers over a set of row ids. Kept side-effect free so the reducer logic is unit
// tested without React. The hook below wraps them with useState for the table/action bar.

export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// Select-all is scoped to the currently visible rows (Pipedrive selects the page, not the DB).
export function selectAll(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

// True only when every visible id is selected (and there is at least one visible row).
export function isAllSelected(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

export interface RowSelection {
  selected: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: (visibleIds: readonly string[]) => void;
  clear: () => void;
  allSelected: (visibleIds: readonly string[]) => boolean;
}

export function useRowSelection(): RowSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((cur) => toggleSelection(cur, id));
  }, []);

  const toggleAll = useCallback((visibleIds: readonly string[]) => {
    setSelected((cur) => (isAllSelected(cur, visibleIds) ? new Set() : selectAll(visibleIds)));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      isSelected: (id: string) => selected.has(id),
      toggle,
      toggleAll,
      clear,
      allSelected: (visibleIds: readonly string[]) => isAllSelected(selected, visibleIds),
    }),
    [selected, toggle, toggleAll, clear],
  );
}
