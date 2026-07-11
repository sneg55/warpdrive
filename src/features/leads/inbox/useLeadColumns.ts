"use client";
import { useCallback, useMemo, useState } from "react";
import { DEFAULT_VISIBLE_COLUMN_KEYS, LEAD_COLUMNS, type LeadColumn } from "./columns";

// The pinned Title column is always first and cannot be hidden or dragged.
const PINNED_KEY = "title";

// Resolve a persisted key list to an ORDERED visible-key array: Title first, then the stored keys
// in order (known-only, deduped). Falls back to defaults when stored is empty/unusable. Unlike the
// old resolveVisible, this keeps the user's chosen column order instead of collapsing to a Set.
export function resolveVisibleOrder(stored: readonly string[] | undefined): string[] {
  const known = new Set(LEAD_COLUMNS.map((c) => c.key));
  const base =
    stored !== undefined && stored.length > 0
      ? stored.filter((k) => known.has(k))
      : DEFAULT_VISIBLE_COLUMN_KEYS;
  const ordered: string[] = [PINNED_KEY];
  for (const k of base) if (k !== PINNED_KEY && !ordered.includes(k)) ordered.push(k);
  return ordered;
}

// Toggle a non-pinned column's visibility, appending newly shown columns to the end.
export function toggleColumnOrder(visible: readonly string[], key: string): string[] {
  const col = LEAD_COLUMNS.find((c) => c.key === key);
  if (col === undefined || col.pinned) return [...visible];
  return visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
}

// Move `from` to `to`'s index. Title is anchored at index 0: it can never be the source or target.
export function reorderColumns(visible: readonly string[], from: string, to: string): string[] {
  if (from === PINNED_KEY || to === PINNED_KEY) return [...visible];
  const fromIdx = visible.indexOf(from);
  const toIdx = visible.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return [...visible];
  const next = [...visible];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}

export interface LeadColumnsState {
  order: readonly string[];
  visibleKeys: ReadonlySet<string>;
  visibleColumns: LeadColumn[];
  toggle: (key: string) => void;
  reorder: (from: string, to: string) => void;
}

export function useLeadColumns(initial?: readonly string[]): LeadColumnsState {
  const [order, setOrder] = useState<readonly string[]>(() => resolveVisibleOrder(initial));

  const toggle = useCallback((key: string) => setOrder((cur) => toggleColumnOrder(cur, key)), []);
  const reorder = useCallback(
    (from: string, to: string) => setOrder((cur) => reorderColumns(cur, from, to)),
    [],
  );

  const visibleKeys = useMemo(() => new Set(order), [order]);
  // Ordered descriptors: map the ordered keys (not the static LEAD_COLUMNS) so the table honors it.
  const visibleColumns = useMemo(
    () =>
      order.flatMap((k) => {
        const c = LEAD_COLUMNS.find((x) => x.key === k);
        return c ? [c] : [];
      }),
    [order],
  );

  return { order, visibleKeys, visibleColumns, toggle, reorder };
}
