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
    .orderBy(await personOrderBy(db, opts.sort, signal), persons.id);
  signal.throwIfAborted();

  const visible = rows.filter((row) => canSee(actor, toVisibleRecord(row)));
  const page = visible.slice(opts.offset, opts.offset + opts.limit);
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
