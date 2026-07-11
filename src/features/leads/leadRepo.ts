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
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { isUuidParam } from "@/lib/isUuidParam";
import { assertNever } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";
import { compileLeadFilter, LEAD_FILTER_CONFIG } from "./leadFilter";
import {
  type LeadListInput,
  type LeadListParsed,
  type LeadNextActivityBucket,
  type LeadSortField,
  leadListInput,
} from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

// Shared row projection so the paged list and the full export stay in lockstep.
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
}

// The full lead record plus resolved person/org/owner display names (detail page).
export type LeadDetail = Lead & {
  personName: string | null;
  orgName: string | null;
  ownerName: string | null;
};

// A single visible lead with resolved names, or null when not visible (404-on-invisible:
// never leak existence to an actor who cannot see the lead).
export async function getLeadById(
  db: Db,
  session: DealVisibilitySession,
  id: string,
  signal: AbortSignal,
): Promise<LeadDetail | null> {
  signal.throwIfAborted();
  // A non-uuid id (a malformed [leadId] path param) can never match a row; short-circuit to the
  // not-found sentinel instead of letting Postgres reject the uuid cast and throw a 500.
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

// Map a sort field to its ORDER BY column. 'ownerName' sorts on the joined users.name;
// 'label' sorts on the leads.labels array (lexicographic, Postgres default).
function sortColumn(field: LeadSortField): SQL {
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

// Server-side next-activity bucket predicate against next_activity_at.
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
      // From the start of today through the next 7 days.
      return sql`${col} >= date_trunc('day', now()) AND ${col} < date_trunc('day', now()) + interval '7 days'`;
    default:
      return assertNever(bucket);
  }
}

function buildFilters(parsed: LeadListParsed): SQL[] {
  const conds: SQL[] = [];
  const { ownerIds, labelKeys, nextActivity, condition } = parsed.filters;
  if (ownerIds !== undefined && ownerIds.length > 0) conds.push(inArray(leads.ownerId, ownerIds));
  if (labelKeys !== undefined && labelKeys.length > 0)
    conds.push(arrayOverlaps(leads.labels, labelKeys));
  if (nextActivity !== undefined) conds.push(nextActivityClause(nextActivity));
  // Inline ad-hoc condition builder: re-validated + compiled to a bound, allow-listed SQL fragment
  // by the leadFilter module (the input was Zod-validated at the boundary; compile is defense in
  // depth). Null when the definition carries no conditions.
  if (condition !== undefined) {
    const frag = compileLeadFilter(condition, LEAD_FILTER_CONFIG);
    if (frag !== null) conds.push(frag);
  }
  return conds;
}

// Visible leads for the Leads Inbox. "inbox" = active (not archived); "archived" = archived only.
// Both exclude soft-deleted rows and apply the same visibility gate as deals. Sort and structured
// filters are applied server-side.
export async function listLeads(
  db: Db,
  session: DealVisibilitySession,
  input: LeadListInput,
  signal: AbortSignal,
): Promise<{ rows: LeadRow[]; total: number }> {
  signal.throwIfAborted();
  // Re-parse so callers may pass a partial object; zod fills sort/filters defaults. Idempotent when
  // the router already parsed via .input(leadListInput).
  const parsed = leadListInput.parse(input);
  const archiveGate =
    parsed.filter === "archived" ? isNotNull(leads.archivedAt) : isNull(leads.archivedAt);
  const where = and(
    isNull(leads.deletedAt),
    archiveGate,
    leadVisibilityClause(session),
    ...buildFilters(parsed),
  );

  const direction = parsed.sort.dir === "asc" ? asc : desc;
  const orderBy = sortColumn(parsed.sort.field);

  const rows = await db
    .select(leadRowSelection)
    .from(leads)
    .leftJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(organizations, eq(organizations.id, leads.orgId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(where)
    // Stable tiebreak so equal sort keys keep a deterministic order. leads.id is the final,
    // guaranteed-unique key so offset pagination can never dup or skip on equal sort + createdAt.
    .orderBy(direction(orderBy), desc(leads.createdAt), asc(leads.id))
    .offset(parsed.offset)
    .limit(parsed.limit);
  signal.throwIfAborted();

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where);
  return { rows, total: countRow?.n ?? 0 };
}

// Full-result export: same visibility gate, filters, and sort as listLeads, but no offset/limit.
// Used by the /leads/export route to serialize every matching row server-side (not just the page).
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
  const direction = parsed.sort.dir === "asc" ? asc : desc;
  const orderBy = sortColumn(parsed.sort.field);

  const rows = await db
    .select(leadRowSelection)
    .from(leads)
    .leftJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(organizations, eq(organizations.id, leads.orgId))
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(where)
    .orderBy(direction(orderBy), desc(leads.createdAt), asc(leads.id));
  signal.throwIfAborted();
  return rows;
}
