import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema/identity";
import { type Lead, leads } from "@/db/schema/leads";
import { type Organization, organizations } from "@/db/schema/organizations";
import { type Person, persons } from "@/db/schema/persons";
import { isCustomFieldSortKey } from "@/features/custom-fields/sortKey";
import { customFieldOrderBy, resolveCustomFieldSort } from "@/features/custom-fields/sortSql";
import { isUuidParam } from "@/lib/isUuidParam";
import { assertNever } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";
import { compileLeadFilter, LEAD_FILTER_CONFIG } from "./leadFilter";
import {
  type LeadBuiltinSortField,
  type LeadListInput,
  type LeadListParsed,
  type LeadNextActivityBucket,
  leadListInput,
} from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

const leadRowSelection = {
  id: leads.id,
  title: leads.title,
  value: leads.value,
  labels: leads.labels,
  sourceOrigin: leads.sourceOrigin,
  personName: persons.name,
  orgName: organizations.name,
  ownerName: users.name,
  nextActivityAt: leads.nextActivityAt,
  createdAt: leads.createdAt,
  archivedAt: leads.archivedAt,
  updatedAt: leads.updatedAt,
  convertedDealId: leads.convertedDealId,
  customFields: sql<Record<string, unknown>>`${leads.customFields}`,
} as const;

export interface LeadRow {
  id: string;
  title: string;
  value: string | null;
  labels: string[];
  sourceOrigin: string;
  personName: string | null;
  orgName: string | null;
  ownerName: string | null;
  nextActivityAt: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  updatedAt: Date;
  convertedDealId: string | null;
  customFields: Record<string, unknown>;
}

export type LeadDetail = Lead & {
  personName: string | null;
  orgName: string | null;
  ownerName: string | null;
};

export interface LeadRelations {
  person: Person | null;
  org: Organization | null;
}

export async function getLeadRelations(
  db: Db,
  lead: Pick<Lead, "personId" | "orgId">,
  signal: AbortSignal,
): Promise<LeadRelations> {
  signal.throwIfAborted();
  const [personRows, orgRows] = await Promise.all([
    lead.personId !== null
      ? db
          .select()
          .from(persons)
          .where(and(eq(persons.id, lead.personId), isNull(persons.deletedAt)))
      : Promise.resolve([]),
    lead.orgId !== null
      ? db
          .select()
          .from(organizations)
          .where(and(eq(organizations.id, lead.orgId), isNull(organizations.deletedAt)))
      : Promise.resolve([]),
  ]);
  signal.throwIfAborted();
  return { person: personRows[0] ?? null, org: orgRows[0] ?? null };
}

export async function getLeadById(
  db: Db,
  session: DealVisibilitySession,
  id: string,
  signal: AbortSignal,
): Promise<LeadDetail | null> {
  signal.throwIfAborted();
  if (!isUuidParam(id)) return null;
  const [row] = await db
    .select({
      ...getTableColumns(leads),
      personName: persons.name,
      orgName: organizations.name,
      ownerName: users.name,
    })
    .from(leads)
    .leftJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(organizations, eq(organizations.id, leads.orgId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(and(eq(leads.id, id), isNull(leads.deletedAt), leadVisibilityClause(session)));
  signal.throwIfAborted();
  return row ?? null;
}

function sortColumn(field: LeadBuiltinSortField): SQL {
  switch (field) {
    case "title":
      return sql`${leads.title}`;
    case "nextActivityAt":
      return sql`${leads.nextActivityAt}`;
    case "ownerName":
      return sql`${users.name}`;
    case "value":
      return sql`${leads.value}`;
    case "label":
      return sql`${leads.labels}`;
    case "sourceOrigin":
      return sql`${leads.sourceOrigin}`;
    case "createdAt":
      return sql`${leads.createdAt}`;
    default:
      return assertNever(field);
  }
}

function nextActivityClause(bucket: LeadNextActivityBucket): SQL {
  const col = leads.nextActivityAt;
  switch (bucket) {
    case "none":
      return sql`${col} IS NULL`;
    case "overdue":
      return sql`${col} < date_trunc('day', now())`;
    case "today":
      return sql`${col} >= date_trunc('day', now()) AND ${col} < date_trunc('day', now()) + interval '1 day'`;
    case "week":
      return sql`${col} >= date_trunc('day', now()) AND ${col} < date_trunc('day', now()) + interval '7 days'`;
    default:
      return assertNever(bucket);
  }
}

async function leadOrderBy(
  db: Db,
  sort: LeadListParsed["sort"],
  signal: AbortSignal,
): Promise<SQL> {
  if (isCustomFieldSortKey(sort.field)) {
    const def = await resolveCustomFieldSort(db, "lead", sort.field, signal);
    return customFieldOrderBy(leads.customFields, def, sort.dir);
  }
  const col = sortColumn(sort.field);
  return sort.dir === "asc" ? asc(col) : desc(col);
}

function buildFilters(parsed: LeadListParsed): SQL[] {
  const conds: SQL[] = [];
  const { ownerIds, labelKeys, nextActivity, condition } = parsed.filters;
  if (ownerIds !== undefined && ownerIds.length > 0) conds.push(inArray(leads.ownerId, ownerIds));
  if (labelKeys !== undefined && labelKeys.length > 0)
    conds.push(arrayOverlaps(leads.labels, labelKeys));
  if (nextActivity !== undefined) conds.push(nextActivityClause(nextActivity));
  if (condition !== undefined) {
    const frag = compileLeadFilter(condition, LEAD_FILTER_CONFIG);
    if (frag !== null) conds.push(frag);
  }
  return conds;
}

export async function listLeads(
  db: Db,
  session: DealVisibilitySession,
  input: LeadListInput,
  signal: AbortSignal,
): Promise<{ rows: LeadRow[]; total: number }> {
  signal.throwIfAborted();
  const parsed = leadListInput.parse(input);
  const archiveGate =
    parsed.filter === "archived" ? isNotNull(leads.archivedAt) : isNull(leads.archivedAt);
  const where = and(
    isNull(leads.deletedAt),
    archiveGate,
    leadVisibilityClause(session),
    ...buildFilters(parsed),
  );

  const orderBy = await leadOrderBy(db, parsed.sort, signal);

  const rows = await db
    .select(leadRowSelection)
    .from(leads)
    .leftJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(organizations, eq(organizations.id, leads.orgId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(where)
    .orderBy(orderBy, desc(leads.createdAt), asc(leads.id))
    .offset(parsed.offset)
    .limit(parsed.limit);
  signal.throwIfAborted();

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where);
  return { rows, total: countRow?.n ?? 0 };
}

export async function listLeadsForExport(
  db: Db,
  session: DealVisibilitySession,
  input: LeadListInput,
  signal: AbortSignal,
): Promise<LeadRow[]> {
  signal.throwIfAborted();
  const parsed = leadListInput.parse(input);
  const archiveGate =
    parsed.filter === "archived" ? isNotNull(leads.archivedAt) : isNull(leads.archivedAt);
  const where = and(
    isNull(leads.deletedAt),
    archiveGate,
    leadVisibilityClause(session),
    ...buildFilters(parsed),
  );
  const orderBy = await leadOrderBy(db, parsed.sort, signal);

  const rows = await db
    .select(leadRowSelection)
    .from(leads)
    .leftJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(organizations, eq(organizations.id, leads.orgId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(where)
    .orderBy(orderBy, desc(leads.createdAt), asc(leads.id));
  signal.throwIfAborted();
  return rows;
}
