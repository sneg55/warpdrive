"use client";
import {
  type ColumnSort,
  cycleSort as genericCycle,
  effectiveSort as genericEffective,
  useColumnSort,
} from "@/components/data-table/useColumnSort";
import type { LeadSortField } from "../schemas";

export type LeadSort = ColumnSort<LeadSortField>;

export const DEFAULT_LEAD_SORT: LeadSort = { field: "createdAt", dir: "desc" };

export function cycleSort(current: LeadSort | null, field: LeadSortField): LeadSort | null {
  return genericCycle(current, field);
}

export function effectiveSort(sort: LeadSort | null): LeadSort {
  return genericEffective(sort, DEFAULT_LEAD_SORT);
}

export function useLeadSort(initial: LeadSort | null = null): {
  sort: LeadSort | null;
  effective: LeadSort;
  cycle: (field: LeadSortField) => void;
} {
  return useColumnSort<LeadSortField>(DEFAULT_LEAD_SORT, initial);
}
