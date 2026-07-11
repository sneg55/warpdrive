import type { ColumnDef } from "@/components/data-table/columnModel";

// The deals List-view column catalog. Title is pinned (row link). To match Pipedrive's default
// deals list (CV-4 / collection-views spec B4), Contact person, Next activity, and Expected close
// date are default-visible alongside Org/Value/Stage/Owner. Their data rides on the board card
// (personName / nextActivityAt / expectedCloseDate), so no extra query beyond one added SELECT.
export const DEAL_LIST_COLUMNS: readonly ColumnDef[] = [
  { key: "title", header: "Title", pinned: true, defaultVisible: true },
  { key: "org", header: "Organization", defaultVisible: true },
  { key: "value", header: "Value", defaultVisible: true },
  { key: "stage", header: "Stage", defaultVisible: true },
  { key: "owner", header: "Owner", defaultVisible: true },
  { key: "person", header: "Contact person", defaultVisible: true },
  { key: "expectedCloseDate", header: "Expected close date", defaultVisible: true },
  { key: "nextActivity", header: "Next activity", defaultVisible: true },
] as const;

// Non-pinned deal-list column keys (everything the generic cell renderer handles; Title is rendered
// specially by DealList because it carries the inline-edit affordance).
export type DealListColumnKey =
  | "org"
  | "value"
  | "stage"
  | "owner"
  | "person"
  | "expectedCloseDate"
  | "nextActivity";
