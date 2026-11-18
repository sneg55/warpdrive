import type { ColumnDef } from "@/components/data-table/columnModel";
import { STRINGS } from "@/constants/strings";
import type { OrgSortField } from "./schemas";

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
  { key: "closedDeals", header: STRINGS.contacts.colClosedDeals, defaultVisible: true },
  { key: "openDeals", header: STRINGS.contacts.colOpenDeals, defaultVisible: true },
  { key: "peopleCount", header: STRINGS.contacts.colPeopleCount, defaultVisible: false },
] as const;
