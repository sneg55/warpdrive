import type { ColumnDef } from "@/components/data-table/columnModel";
import { STRINGS } from "@/constants/strings";
import type { PersonSortField } from "./schemas";

// People list column catalog. Name is pinned (row link + avatar) and sortable; Email is sortable.
// Org/Phone are plain. Closed deals (won+lost count) rides on a batched deal-count join in the list
// query (see listPeople/peopleDealCounts). Customize columns adds reorder + hide. Offering Owner /
// Last activity as NEW columns needs a users/activities join (CL3 follow-on), not in the catalog yet.
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
