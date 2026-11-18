import type { ColumnDef } from "@/components/data-table/columnModel";

export const DEAL_LIST_COLUMNS: readonly ColumnDef[] = [
  { key: "title", header: "Title", pinned: true, defaultVisible: true },
  { key: "org", header: "Organization", defaultVisible: true },
  { key: "value", header: "Value", defaultVisible: true },
  { key: "stage", header: "Stage", defaultVisible: true },
  { key: "owner", header: "Owner", defaultVisible: true },
  { key: "person", header: "Contact person", defaultVisible: true },
  { key: "expectedCloseDate", header: "Expected close date", defaultVisible: true },
  { key: "nextActivity", header: "Next activity", defaultVisible: true },
  { key: "status", header: "Status" },
] as const;
