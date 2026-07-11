import { organizations } from "@/db/schema";
import { assertNever } from "@/types/result";
import type { OrgSortField } from "./schemas";

// Map an Organizations-list sort field to its ORDER BY column. Extend here as more columns become
// sortable (mirrors personSortColumn). ORG_SORT_FIELDS has one member today, so TS narrows the
// switch to a single literal; kept as a switch/assertNever so the exhaustiveness check is already
// wired up for the next sortable column. Extracted from orgsRepo to keep that file under budget.
export function orgSortColumn(field: OrgSortField) {
  switch (field) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "name":
      return organizations.name;
    default:
      return assertNever(field);
  }
}
