"use client";

import { useCallback, useMemo, useState } from "react";
import { PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";

export interface ProspectSelection {
  selected: string[];
  count: number;
  isFull: boolean;
  isSelected: (providerRef: string) => boolean;
  toggle: (providerRef: string) => void;
  selectMany: (providerRefs: readonly string[]) => void;
  deselectMany: (providerRefs: readonly string[]) => void;
  clear: () => void;
}

function addWithinCap(current: readonly string[], additions: readonly string[]): string[] {
  const next = [...current];
  const held = new Set(current);
  for (const ref of additions) {
    if (next.length >= PROSPECT_SELECTION_MAX) break;
    if (held.has(ref)) continue;
    held.add(ref);
    next.push(ref);
  }
  return next;
}

export function useProspectSelection(): ProspectSelection {
  const [selected, setSelected] = useState<string[]>([]);

  const isSelected = useCallback(
    (providerRef: string) => selected.includes(providerRef),
    [selected],
  );

  const selectMany = useCallback((providerRefs: readonly string[]) => {
    setSelected((current) => addWithinCap(current, providerRefs));
  }, []);

  const deselectMany = useCallback((providerRefs: readonly string[]) => {
    const dropped = new Set(providerRefs);
    setSelected((current) => current.filter((ref) => !dropped.has(ref)));
  }, []);

  const toggle = useCallback((providerRef: string) => {
    setSelected((current) =>
      current.includes(providerRef)
        ? current.filter((ref) => ref !== providerRef)
        : addWithinCap(current, [providerRef]),
    );
  }, []);

  const clear = useCallback(() => {
    setSelected([]);
  }, []);

  return useMemo(
    () => ({
      selected,
      count: selected.length,
      isFull: selected.length >= PROSPECT_SELECTION_MAX,
      isSelected,
      toggle,
      selectMany,
      deselectMany,
      clear,
    }),
    [selected, isSelected, toggle, selectMany, deselectMany, clear],
  );
}
