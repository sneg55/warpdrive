"use client";
// Thin re-export: row selection now lives in the generic, id-agnostic
// src/components/data-table/useRowSelection so other lists (people, orgs, email,
// activities) can adopt it later. Kept here so existing leads-inbox imports don't churn.
export {
  isAllSelected,
  type RowSelection as LeadSelection,
  selectAll,
  toggleSelection,
  useRowSelection as useLeadSelection,
} from "@/components/data-table/useRowSelection";
