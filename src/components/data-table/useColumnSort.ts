"use client";
import { useCallback, useState } from "react";

export interface ColumnSort<F extends string> {
  field: F;
  dir: "asc" | "desc";
}

// Header click cycles the active field asc to desc to null (default); a click on a
// different field jumps to that field ascending. Single active sort column.
export function cycleSort<F extends string>(
  current: ColumnSort<F> | null,
  field: F,
): ColumnSort<F> | null {
  if (current === null || current.field !== field) return { field, dir: "asc" };
  if (current.dir === "asc") return { field, dir: "desc" };
  return null;
}

// Resolve the (possibly null) sort state to the concrete sort sent to the server.
export function effectiveSort<F extends string>(
  sort: ColumnSort<F> | null,
  fallback: ColumnSort<F>,
): ColumnSort<F> {
  return sort ?? fallback;
}

export function useColumnSort<F extends string>(
  fallback: ColumnSort<F>,
  initial: ColumnSort<F> | null = null,
): { sort: ColumnSort<F> | null; effective: ColumnSort<F>; cycle: (field: F) => void } {
  const [sort, setSort] = useState<ColumnSort<F> | null>(initial);
  const cycle = useCallback((field: F) => setSort((cur) => cycleSort(cur, field)), []);
  return { sort, effective: effectiveSort(sort, fallback), cycle };
}
