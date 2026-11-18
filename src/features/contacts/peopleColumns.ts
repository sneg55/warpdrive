import type { ColumnDef } from "@/components/data-table/columnModel";
import { STRINGS } from "@/constants/strings";
import type { PersonSortField } from "./schemas";

export interface PeopleColumn extends ColumnDef {
  sortField?: PersonSortField;
}

export const PEOPLE_COLUMNS: readonly PeopleColumn[] = [
  {
    key: "name",
    header: STRINGS.contacts.colName,
    pinned: true,
    defaultVisible: true,
    sortField: "name",
  },
  { key: "org", header: STRINGS.contacts.colOrg, defaultVisible: true },
  {
    key: "email",
    header: STRINGS.contacts.colEmail,
    defaultVisible: true,
    sortField: "primaryEmail",
  },
  { key: "phone", header: STRINGS.contacts.colPhone, defaultVisible: true },
  { key: "closedDeals", header: STRINGS.contacts.colClosedDeals, defaultVisible: true },
] as const;
