"use client";
import { useCallback, useMemo, useState } from "react";
import {
  type ColumnDef,
  reorderColumns,
  resolveVisibleOrder,
  toggleColumnOrder,
} from "./columnModel";

export interface ColumnsState<T extends ColumnDef> {
  order: readonly string[];
  visibleKeys: ReadonlySet<string>;
  visibleColumns: T[];
  toggle: (key: string) => void;
  reorder: (from: string, to: string) => void;
}

// Generic column visibility/order hook: seeds from a stored order (user_preferences) and drives the
// shared ColumnsMenu. Same shape as the original leads useLeadColumns, now catalog-parameterized so
// deals list, people, and orgs reuse it verbatim.
export function useColumns<T extends ColumnDef>(
  catalog: readonly T[],
  initial: readonly string[] | undefined,
): ColumnsState<T> {
  const [order, setOrder] = useState<readonly string[]>(() =>
    resolveVisibleOrder(catalog, initial),
  );

  const toggle = useCallback(
    (key: string) => setOrder((cur) => toggleColumnOrder(catalog, cur, key)),
    [catalog],
  );
  const reorder = useCallback(
    (from: string, to: string) => setOrder((cur) => reorderColumns(catalog, cur, from, to)),
    [catalog],
  );

  const visibleKeys = useMemo(() => new Set(order), [order]);
  const visibleColumns = useMemo(
    () =>
      order.flatMap((k) => {
        const c = catalog.find((x) => x.key === k);
        return c ? [c] : [];
      }),
    [order, catalog],
  );

  return { order, visibleKeys, visibleColumns, toggle, reorder };
}
