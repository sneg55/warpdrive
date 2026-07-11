import type { ColumnDef } from "@/components/data-table/columnModel";
import { STRINGS } from "@/constants/strings";
import type { OrgSortField } from "./schemas";

// Organizations list column catalog. Name is pinned (row link + avatar) and sortable; Address /
// People count / Deal count are plain, all default-visible. Customize columns adds reorder + hide.
export interface OrgColumn extends ColumnDef {
  sortField?: OrgSortField;
}

export const ORG_COLUMNS: readonly OrgColumn[] = [
  {
    key: "name",
    header: STRINGS.contacts.colName,
    pinned: true,
    defaultVisible: true,
    sortField: "name",
  },
  { key: "address", header: STRINGS.contacts.colAddress, defaultVisible: true },
  // Pipedrive's org list defaults to Name / Address / Closed deals / Open deals. People count is
  // a WD extra, retained but opt-in (Customize columns) so the default matches PD.
  { key: "closedDeals", header: STRINGS.contacts.colClosedDeals, defaultVisible: true },
  { key: "openDeals", header: STRINGS.contacts.colOpenDeals, defaultVisible: true },
  { key: "peopleCount", header: STRINGS.contacts.colPeopleCount, defaultVisible: false },
] as const;
