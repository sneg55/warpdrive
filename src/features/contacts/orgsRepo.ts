import { and, asc, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Organization } from "@/db/schema";
import { organizations, users } from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { isUuidParam } from "@/lib/isUuidParam";
import { err, ok, type Result } from "@/types/result";
import {
  type ContactFilterDefinition,
  compileContactFilter,
  ORG_COLUMN_SQL,
  ORG_FILTER_CONFIG,
} from "./contactFilter";
import { validateContactCustomFields } from "./customFieldsValidation";
import { orgCounts } from "./orgCounts";
import { orgSortColumn } from "./orgSort";
import type { ContactActor } from "./personsRepo";
import { resolveOwnerUpdate } from "./resolveOwnerUpdate";
import type { OrgCreateInput, OrgSortField, OrgUpdateInput } from "./schemas";
import { deriveContactVisibility } from "./visibility";

// Structured address from addressInputSchema: all subfields optional, address nullable.
type AddressInput = {
  street?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
  lat?: number;
  lng?: number;
};

// Build VisiblePersonOrOrg for canSee checks (explicit, no spread). Exported so deleteOrg.ts
// (a separate file, kept small per the file-size convention) can reuse the same
// canSee/contact.delete gate as updateOrg without duplicating the record projection.
export function toVisibleRecord(row: Organization): VisiblePersonOrOrg {
  return {
    kind: "organization",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  };
}

// The Org Summary presents Street/City/Region/Country as independent, individually editable
// inline fields, so a partial address (e.g. Street + City, no Country yet) is legitimate and
// MUST NOT be rejected: a country-required gate here silently reverted such edits (CONTACTS-20).
// The only remaining structural invariant is that geo coordinates come as a pair, since a lone
// lat or lng is meaningless. Exported for a direct unit test of that relaxed rule.
export function addressIsValid(a: AddressInput): boolean {
  const hasLat = a.lat != null;
  const hasLng = a.lng != null;
  return hasLat === hasLng;
}

export async function createOrg(
  db: Db,
  actor: ContactActor,
  input: OrgCreateInput,
  signal: AbortSignal,
): Promise<Result<Organization, AppError>> {
  signal.throwIfAborted();

  if (input.address !== null && addressIsValid(input.address) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_ADDRESS_INVALID, "address invalid", {}));
  }

  const cfResult = await validateContactCustomFields(
    db,
    "organization",
    input.customFields,
    signal,
  );
  if (cfResult.ok === false) return cfResult;

  const visResult = await deriveContactVisibility(db, actor, "organization", signal);
  if (visResult.ok === false) return visResult;

  const { level, visibilityGroupId } = visResult.value;
  signal.throwIfAborted();

  const [row] = await db
    .insert(organizations)
    .values({
      name: input.name,
      address: input.address,
      ownerId: actor.id,
      visibilityLevel: level,
      visibilityGroupId,
      customFields: cfResult.value,
    })
    .returning();

  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
  }
  return ok(row);
}

export async function updateOrg(
  db: Db,
  actor: ContactActor,
  input: OrgUpdateInput,
  signal: AbortSignal,
): Promise<Result<Organization, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();

    const [current] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, input.id), isNull(organizations.deletedAt)));

    if (current === undefined || canSee(actor, toVisibleRecord(current)) === false) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id: input.id }));
    }
    // Edit capability gate (F2): visibility alone is not authority to mutate.
    if (!can(actor, "contact.edit", toVisibleRecord(current))) {
      return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { id: input.id }));
    }

    if (
      input.address !== undefined &&
      input.address !== null &&
      addressIsValid(input.address) === false
    ) {
      return err(new AppError(ERROR_IDS.CONTACT_ADDRESS_INVALID, "address invalid", {}));
    }

    let resolvedCustomFields: Record<string, unknown> = current.customFields as Record<
      string,
      unknown
    >;
    if (input.customFields !== undefined) {
      const cfResult = await validateContactCustomFields(
        db,
        "organization",
        input.customFields,
        signal,
      );
      if (cfResult.ok === false) return cfResult;
      resolvedCustomFields = cfResult.value;
    }

    // Owner transfer (CO-3): gated by deal.changeOwner/admin; ignored otherwise.
    const ownerResult = await resolveOwnerUpdate(tx, actor, input.ownerId, current.ownerId, signal);
    if (ownerResult.ok === false) return ownerResult;

    const [row] = await tx
      .update(organizations)
      .set({
        name: input.name ?? current.name,
        ownerId: ownerResult.value,
        address: input.address === undefined ? current.address : input.address,
        customFields: resolvedCustomFields,
        domain: input.domain === undefined ? current.domain : input.domain,
        industry: input.industry === undefined ? current.industry : input.industry,
        employeeCount:
          input.employeeCount === undefined ? current.employeeCount : input.employeeCount,
        annualRevenue:
          input.annualRevenue === undefined ? current.annualRevenue : input.annualRevenue,
        linkedinUrl: input.linkedinUrl === undefined ? current.linkedinUrl : input.linkedinUrl,
        // Add-labels (spec B5): omitted -> leave untouched.
        labels: input.labels ?? current.labels,
      })
      .where(and(eq(organizations.id, input.id), isNull(organizations.deletedAt)))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "update returned no rows", {}));
    }
    return ok(row);
  });
}

// The full org record plus the resolved owner display name (detail page, Wave 4 Task 5). A
// separate type (not an Organization field) because the name only exists via a join to users.
export type OrgDetail = Organization & { ownerName: string | null };

export async function getOrg(
  db: Db,
  actor: ContactActor,
  id: string,
  signal: AbortSignal,
): Promise<Result<OrgDetail, AppError>> {
  signal.throwIfAborted();

  // A non-uuid id (a malformed [orgId] path param) can never match a row; return the
  // not-found err instead of letting Postgres reject the uuid cast and throw a 500.
  if (!isUuidParam(id)) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id }));
  }

  const [row] = await db
    .select({ ...getTableColumns(organizations), ownerName: users.name })
    .from(organizations)
    .leftJoin(users, eq(users.id, organizations.ownerId))
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));

  if (row === undefined || canSee(actor, toVisibleRecord(row)) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id }));
  }
  return ok(row);
}

// A listOrgs row: the organization record plus visibility-gated counts (Task 19).
export interface OrgListRow extends Organization {
  peopleCount: number;
  // Pipedrive splits the org list's deal count into Closed (won+lost) and Open columns.
  closedDeals: number;
  openDeals: number;
}

export interface ListOrgsResult {
  rows: OrgListRow[];
  total: number;
}

// Global organizations list for the contacts nav. Mirrors listPeople: fetch
// non-deleted rows ordered by name, filter to the visible set (canSee), and
// paginate that set. total is the visible count so an actor never learns how
// many hidden orgs exist.
export async function listOrgs(
  db: Db,
  actor: ContactActor,
  opts: {
    offset: number;
    limit: number;
    sort?: { field: OrgSortField; dir: "asc" | "desc" };
    filter?: ContactFilterDefinition;
  },
  signal: AbortSignal,
): Promise<ListOrgsResult> {
  signal.throwIfAborted();

  const orderDir = opts.sort?.dir === "desc" ? desc : asc;
  const orderCol = opts.sort !== undefined ? orgSortColumn(opts.sort.field) : orgSortColumn("name");
  // Server-side condition filter, AND-ed after the not-deleted guard and before the JS visibility
  // filter (so hidden rows never leak). Null when no conditions were given.
  const filterSql =
    opts.filter !== undefined
      ? compileContactFilter(opts.filter, ORG_FILTER_CONFIG, ORG_COLUMN_SQL)
      : null;
  const whereClause =
    filterSql !== null
      ? and(isNull(organizations.deletedAt), filterSql)
      : isNull(organizations.deletedAt);

  const rows = await db
    .select()
    .from(organizations)
    .where(whereClause)
    // id is the unique tiebreaker: name is non-unique, and load-more issues a separate
    // offset query per page, so equal-name rows straddling a boundary can dup or skip
    // without a stable secondary sort.
    .orderBy(orderDir(orderCol), organizations.id);
  signal.throwIfAborted();

  const visible = rows.filter((row) => canSee(actor, toVisibleRecord(row)));
  const page = visible.slice(opts.offset, opts.offset + opts.limit);

  // Counts are computed only for the sliced page (not every visible org), and are
  // visibility-gated per actor (see orgCounts): a naive COUNT(*) over all people/deals
  // would leak the existence of records the actor can't otherwise see.
  const { peopleCounts, closedDealCounts, openDealCounts } = await orgCounts(
    db,
    actor,
    page.map((row) => row.id),
    signal,
  );

  return {
    total: visible.length,
    rows: page.map((row) => ({
      ...row,
      peopleCount: peopleCounts.get(row.id) ?? 0,
      closedDeals: closedDealCounts.get(row.id) ?? 0,
      openDeals: openDealCounts.get(row.id) ?? 0,
    })),
  };
}

// listOrgOptions (lightweight {id,name} projection for pickers) lives in ./orgOptionsRepo, split
// out to keep this file under the size budget (mirrors personOptionsRepo).
