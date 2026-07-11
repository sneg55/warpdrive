import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealParticipants, deals, persons, pipelines } from "@/db/schema";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { ContactActor } from "./personsRepo";

export interface OrgCounts {
  peopleCounts: Map<string, number>;
  // Pipedrive's org list shows Closed deals (won+lost) and Open deals as separate columns, so the
  // per-org deal count is bucketed by status rather than returned as a single all-status total.
  closedDealCounts: Map<string, number>;
  openDealCounts: Map<string, number>;
}

// Deal statuses that count as "closed" (won+lost), mirroring the People-list Closed-deals column.
const CLOSED_STATUSES = new Set(["won", "lost"]);

interface PeopleCountsResult {
  peopleCounts: Map<string, number>;
  // personId -> orgId, for every non-deleted person on a page org, regardless of person
  // visibility. dealsForOrg traces participant deals through this same unfiltered set (only
  // the deal's own canSee decides countability), so the deal-count pass reuses it as-is.
  personIdToOrgId: Map<string, string>;
}

// canSee-gated people count per org (mirrors listPeopleForOrg's filter), plus the
// personId -> orgId map the deal-count pass needs to trace participant-derived deals.
async function peopleCountsForOrgs(
  db: Db,
  actor: ContactActor,
  orgIds: string[],
  signal: AbortSignal,
): Promise<PeopleCountsResult> {
  const orgPersons = await db
    .select({
      id: persons.id,
      orgId: persons.orgId,
      ownerId: persons.ownerId,
      visibilityLevel: persons.visibilityLevel,
      visibilityGroupId: persons.visibilityGroupId,
      visibleToUserIds: persons.visibleToUserIds,
    })
    .from(persons)
    .where(and(inArray(persons.orgId, orgIds), isNull(persons.deletedAt)));
  signal.throwIfAborted();

  const peopleCounts = new Map<string, number>();
  const personIdToOrgId = new Map<string, string>();
  for (const p of orgPersons) {
    if (p.orgId === null) continue;
    personIdToOrgId.set(p.id, p.orgId);
    if (canSee(actor, { kind: "person", ...p })) {
      peopleCounts.set(p.orgId, (peopleCounts.get(p.orgId) ?? 0) + 1);
    }
  }
  return { peopleCounts, personIdToOrgId };
}

// dealId -> the set of page-org ids reached via a participant belonging to that org.
async function participantDealOrgIds(
  db: Db,
  personIdToOrgId: Map<string, string>,
  signal: AbortSignal,
): Promise<Map<string, Set<string>>> {
  const personIds = [...personIdToOrgId.keys()];
  const rows =
    personIds.length === 0
      ? []
      : await db
          .select({ dealId: dealParticipants.dealId, personId: dealParticipants.personId })
          .from(dealParticipants)
          .where(inArray(dealParticipants.personId, personIds));
  signal.throwIfAborted();

  const dealIdToOrgIds = new Map<string, Set<string>>();
  for (const r of rows) {
    const orgId = personIdToOrgId.get(r.personId);
    if (orgId === undefined) continue;
    const set = dealIdToOrgIds.get(r.dealId) ?? new Set<string>();
    set.add(orgId);
    dealIdToOrgIds.set(r.dealId, set);
  }
  return dealIdToOrgIds;
}

// dealsForOrg-style aggregation, batched: a deal counts toward an org if the deal's own
// orgId matches, OR one of its participants belongs to that org (dealIdToOrgIds). Each
// candidate deal is canSee-gated once, then credited to every page-org it matched.
async function dealCountsForOrgs(
  db: Db,
  actor: ContactActor,
  orgIds: string[],
  personIdToOrgId: Map<string, string>,
  signal: AbortSignal,
): Promise<{ closed: Map<string, number>; open: Map<string, number> }> {
  const orgIdSet = new Set(orgIds);
  const dealIdToOrgIds = await participantDealOrgIds(db, personIdToOrgId, signal);
  const participantDealIds = [...dealIdToOrgIds.keys()];

  // Narrowed to id + orgId (the org-match columns) + status (closed/open bucketing) plus the
  // VisibleDealFields set toVisibleDeal reads, instead of the full deals row, since this runs on
  // every org-list load.
  const dealRows = await db
    .select({
      id: deals.id,
      orgId: deals.orgId,
      status: deals.status,
      ownerId: deals.ownerId,
      visibilityLevel: deals.visibilityLevel,
      visibilityGroupId: deals.visibilityGroupId,
      visibleToUserIds: deals.visibleToUserIds,
      pipeVg: pipelines.visibilityGroupId,
    })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(
      and(
        isNull(deals.deletedAt),
        // Archived-pipeline deals are hidden from every read (F7/F15/F16/F21-F24).
        eq(pipelines.isArchived, false),
        or(
          inArray(deals.orgId, orgIds),
          participantDealIds.length > 0 ? inArray(deals.id, participantDealIds) : undefined,
        ),
      ),
    );
  signal.throwIfAborted();

  const closed = new Map<string, number>();
  const open = new Map<string, number>();
  for (const row of dealRows) {
    if (!canSee(actor, toVisibleDeal(row, row.pipeVg))) continue;

    const matchedOrgIds = new Set(dealIdToOrgIds.get(row.id));
    if (row.orgId !== null && orgIdSet.has(row.orgId)) matchedOrgIds.add(row.orgId);

    const bucket = CLOSED_STATUSES.has(row.status) ? closed : open;
    for (const orgId of matchedOrgIds) {
      bucket.set(orgId, (bucket.get(orgId) ?? 0) + 1);
    }
  }
  return { closed, open };
}

// Batched, visibility-gated People/Deal counts for a page of organizations. Three queries
// total regardless of page size, so listOrgs never fans out to N per-row queries (one
// dealsForOrg-style call per org would be an N+1).
export async function orgCounts(
  db: Db,
  actor: ContactActor,
  orgIds: string[],
  signal: AbortSignal,
): Promise<OrgCounts> {
  signal.throwIfAborted();
  if (orgIds.length === 0) {
    return { peopleCounts: new Map(), closedDealCounts: new Map(), openDealCounts: new Map() };
  }

  const { peopleCounts, personIdToOrgId } = await peopleCountsForOrgs(db, actor, orgIds, signal);
  const { closed, open } = await dealCountsForOrgs(db, actor, orgIds, personIdToOrgId, signal);

  return { peopleCounts, closedDealCounts: closed, openDealCounts: open };
}
