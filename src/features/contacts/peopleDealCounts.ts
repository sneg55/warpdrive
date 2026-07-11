import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dealParticipants, deals, pipelines } from "@/db/schema";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { ContactActor } from "./personsRepo";

// Deal statuses that count as "closed" for the People-list Closed-deals column (Pipedrive counts
// both won and lost). Open deals are excluded.
const CLOSED_STATUSES = ["won", "lost"] as const;

// dealId -> the set of page-person ids reached via a participant row. Mirrors orgCounts'
// participantDealOrgIds: a deal counts toward a person if the deal's own person_id matches OR the
// person is a participant on it.
async function participantDealPersonIds(
  db: Db,
  personIds: string[],
  signal: AbortSignal,
): Promise<Map<string, Set<string>>> {
  const rows =
    personIds.length === 0
      ? []
      : await db
          .select({ dealId: dealParticipants.dealId, personId: dealParticipants.personId })
          .from(dealParticipants)
          .where(inArray(dealParticipants.personId, personIds));
  signal.throwIfAborted();

  const byDeal = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byDeal.get(r.dealId) ?? new Set<string>();
    set.add(r.personId);
    byDeal.set(r.dealId, set);
  }
  return byDeal;
}

// Batched, visibility-gated count of closed (won+lost) deals per person for a page of people. Two
// queries total regardless of page size (participants, then the candidate deals), so the People
// list never fans out to N per-row queries. Modeled on orgCounts.dealCountsForOrgs.
export async function closedDealCountsForPeople(
  db: Db,
  actor: ContactActor,
  personIds: string[],
  signal: AbortSignal,
): Promise<Map<string, number>> {
  signal.throwIfAborted();
  if (personIds.length === 0) return new Map();

  const personIdSet = new Set(personIds);
  const dealIdToPersonIds = await participantDealPersonIds(db, personIds, signal);
  const participantDealIds = [...dealIdToPersonIds.keys()];

  const dealRows = await db
    .select({
      id: deals.id,
      personId: deals.personId,
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
        // Archived-pipeline deals are hidden from every read (matches orgCounts).
        eq(pipelines.isArchived, false),
        inArray(deals.status, CLOSED_STATUSES),
        or(
          inArray(deals.personId, personIds),
          participantDealIds.length > 0 ? inArray(deals.id, participantDealIds) : undefined,
        ),
      ),
    );
  signal.throwIfAborted();

  const counts = new Map<string, number>();
  for (const row of dealRows) {
    if (!canSee(actor, toVisibleDeal(row, row.pipeVg))) continue;
    const matched = new Set(dealIdToPersonIds.get(row.id));
    if (row.personId !== null && personIdSet.has(row.personId)) matched.add(row.personId);
    for (const personId of matched) counts.set(personId, (counts.get(personId) ?? 0) + 1);
  }
  return counts;
}
