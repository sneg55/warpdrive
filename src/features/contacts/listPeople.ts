import { and, asc, desc, isNull, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { persons } from "@/db/schema";
import { isCustomFieldSortKey } from "@/features/custom-fields/sortKey";
import { customFieldOrderBy, resolveCustomFieldSort } from "@/features/custom-fields/sortSql";
import { canSee } from "@/features/permissions/canSee";
import { assertNever } from "@/types/result";
import {
  type ContactFilterDefinition,
  compileContactFilter,
  PERSON_COLUMN_SQL,
  PERSON_FILTER_CONFIG,
} from "./contactFilter";
import { closedDealCountsForPeople } from "./peopleDealCounts";
import { type ContactActor, toVisibleRecord } from "./personsRepo";
import type { PersonBuiltinSortField, PersonSortField } from "./schemas";

type PersonListItem = Person & { closedDeals: number; customFields: Record<string, unknown> };

export interface ListPeopleResult {
  rows: PersonListItem[];
  total: number;
}

// Map a sort field to its ORDER BY column. Extend here as more People-list columns become sortable.
function personSortColumn(field: PersonBuiltinSortField) {
  switch (field) {
    case "name":
      return persons.name;
    case "primaryEmail":
      return persons.primaryEmail;
    default:
      return assertNever(field);
  }
}

async function personOrderBy(
  db: Db,
  sort: { field: PersonSortField; dir: "asc" | "desc" } | undefined,
  signal: AbortSignal,
): Promise<SQL> {
  const dir = sort?.dir ?? "asc";
  const field = sort?.field ?? "name";
  if (isCustomFieldSortKey(field)) {
    const def = await resolveCustomFieldSort(db, "person", field, signal);
    return customFieldOrderBy(persons.customFields, def, dir);
  }
  const col = personSortColumn(field);
  return dir === "desc" ? desc(col) : asc(col);
}

// Global people list for the contacts nav. Persons carry JS-side visibility (canSee), consistent
// with listPeopleForOrg, so we fetch non-deleted rows ordered by name, filter to the visible set,
// and paginate that set. total is the visible count (what the UI pages over), NOT the raw row
// count, so an actor never learns how many hidden people exist.
export async function listPeople(
  db: Db,
  actor: ContactActor,
  opts: {
    offset: number;
    limit: number;
    sort?: { field: PersonSortField; dir: "asc" | "desc" };
    filter?: ContactFilterDefinition;
  },
  signal: AbortSignal,
): Promise<ListPeopleResult> {
  signal.throwIfAborted();

  // Server-side condition filter (AND-ed after the not-deleted guard, BEFORE the JS visibility
  // filter so an actor never learns hidden rows exist). Null when no conditions were given.
  const filterSql =
    opts.filter !== undefined
      ? compileContactFilter(opts.filter, PERSON_FILTER_CONFIG, PERSON_COLUMN_SQL)
      : null;
  const whereClause =
    filterSql !== null ? and(isNull(persons.deletedAt), filterSql) : isNull(persons.deletedAt);

  const rows = await db
    .select()
    .from(persons)
    .where(whereClause)
    // id is the unique tiebreaker: the sort column is non-unique, and load-more issues a separate
    // offset query per page, so equal-value rows straddling a boundary can dup or skip without a
    // stable secondary sort.
    .orderBy(await personOrderBy(db, opts.sort, signal), persons.id);
  signal.throwIfAborted();

  const visible = rows.filter((row) => canSee(actor, toVisibleRecord(row)));
  const page = visible.slice(opts.offset, opts.offset + opts.limit);
  // Closed-deals count is computed only for the returned page (not the whole visible set), so the
  // extra deal/participant queries scale with the page, not the org's entire contact list.
  const closedCounts = await closedDealCountsForPeople(
    db,
    actor,
    page.map((p) => p.id),
    signal,
  );
  return {
    total: visible.length,
    rows: page.map((p) => ({
      ...p,
      closedDeals: closedCounts.get(p.id) ?? 0,
      customFields: p.customFields as Record<string, unknown>,
    })),
  };
}
