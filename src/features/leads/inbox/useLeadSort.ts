"use client";
// Thin re-export: column sort now lives in the generic, field-agnostic
// src/components/data-table/useColumnSort so other lists (people, orgs, email,
// activities) can adopt it later. Kept here so existing leads-inbox imports don't churn.
import {
  type ColumnSort,
  cycleSort as genericCycle,
  effectiveSort as genericEffective,
  useColumnSort,
} from "@/components/data-table/useColumnSort";
import type { LeadSortField } from "../schemas";

export type LeadSort = ColumnSort<LeadSortField>;

// Default server sort (matches leadListInput): newest first. `null` sort state means "use default".
export const DEFAULT_LEAD_SORT: LeadSort = { field: "createdAt", dir: "desc" };

// Pure cycle: a header click on `field` cycles asc -> desc -> default (null). A click on a different
// field jumps straight to that field ascending (single active sort column at a time).
export function cycleSort(current: LeadSort | null, field: LeadSortField): LeadSort | null {
  return genericCycle(current, field);
}

// Resolve the (possibly null) sort state to the concrete sort sent to the server.
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
