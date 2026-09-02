import type { ColumnDef } from "@/components/data-table/columnModel";
import type { LeadSortField } from "../schemas";

export interface LeadColumn extends ColumnDef {
  sortField?: LeadSortField;
}

export const LEAD_COLUMNS: readonly LeadColumn[] = [
  { key: "title", header: "Title", sortField: "title", pinned: true, defaultVisible: true },
  {
    key: "nextActivity",
    header: "Next activity",
    sortField: "nextActivityAt",
    defaultVisible: true,
  },
  { key: "labels", header: "Labels", sortField: "label", defaultVisible: true },
  { key: "sourceOrigin", header: "Source origin", sortField: "sourceOrigin", defaultVisible: true },
  { key: "value", header: "Value", sortField: "value", defaultVisible: false },
  { key: "createdAt", header: "Lead created", sortField: "createdAt", defaultVisible: true },
  { key: "owner", header: "Owner", sortField: "ownerName", defaultVisible: true },
] as const;
