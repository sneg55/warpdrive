import { asc, desc, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { isCustomFieldSortKey } from "@/features/custom-fields/sortKey";
import { customFieldOrderBy, resolveCustomFieldSort } from "@/features/custom-fields/sortSql";
import { assertNever } from "@/types/result";
import type { OrgBuiltinSortField, OrgSortField } from "./schemas";

export function orgSortColumn(field: OrgBuiltinSortField) {
  switch (field) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "name":
      return organizations.name;
    default:
      return assertNever(field);
  }
}

export async function orgOrderBy(
  db: Db,
  sort: { field: OrgSortField; dir: "asc" | "desc" } | undefined,
  signal: AbortSignal,
): Promise<SQL> {
  const dir = sort?.dir ?? "asc";
  const field = sort?.field ?? "name";
  if (isCustomFieldSortKey(field)) {
    const def = await resolveCustomFieldSort(db, "organization", field, signal);
    return customFieldOrderBy(organizations.customFields, def, dir);
  }
  const col = orgSortColumn(field);
  return dir === "desc" ? desc(col) : asc(col);
}
