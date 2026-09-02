// Enriched read for a deal's participants (PD-parity participants table + Summary count-link +
// sidebar section). Split from participants.ts (mutations + org/person aggregations) to keep
// both under the file-size cap.
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { VisibilityLevel } from "@/constants/visibility";
import type { Db } from "@/db/client";
import {
  activities,
  dealParticipants,
  deals,
  organizations,
  persons,
  pipelines,
  users,
} from "@/db/schema";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { dealsForPerson } from "./participants";

export interface DealParticipant {
  personId: string;
  name: string;
  isPrimary: boolean;
  isExplicit: boolean;
  // Enriched columns for the PD-style participants table (modal): the participant's org, primary
  // contact points, their owner, per-person open/closed deal counts, and next planned activity.
  orgName: string | null;
  primaryEmail: string | null;
  phone: string | null;
  ownerName: string | null;
  closedDeals: number;
  openDeals: number;
  nextActivityAt: Date | null;
}

// The participant's shown phone: the primary contact point, else the first.
function primaryPhone(phones: readonly { value: string; primary?: boolean }[]): string | null {
  const hit = phones.find((p) => p.primary === true) ?? phones[0];
  return hit?.value ?? null;
}

interface JoinedOrgVisibility {
  orgName: string | null;
  orgOwnerId: string | null;
  orgVisibilityLevel: VisibilityLevel | null;
  orgVisibilityGroupId: string | null;
  orgVisibleToUserIds: string[] | null;
}

function visibleOrgName(actor: PermSetUser, row: JoinedOrgVisibility): string | null {
  if (row.orgName === null || row.orgOwnerId === null || row.orgVisibilityLevel === null) {
    return null;
  }
  const allowed = canSee(actor, {
    kind: "organization",
    ownerId: row.orgOwnerId,
    visibilityLevel: row.orgVisibilityLevel,
    visibilityGroupId: row.orgVisibilityGroupId,
    visibleToUserIds: row.orgVisibleToUserIds ?? [],
  });
  return allowed ? row.orgName : null;
}

async function nextActivityByPerson(
  db: Db,
  actor: PermSetUser,
  personIds: string[],
  signal: AbortSignal,
): Promise<Map<string, Date>> {
  const rows = await db
    .select({
      personId: activities.personId,
      dueAt: activities.dueAt,
      deal: deals,
      pipeVg: pipelines.visibilityGroupId,
      pipeArchived: pipelines.isArchived,
    })
    .from(activities)
    .leftJoin(deals, and(eq(deals.id, activities.dealId), isNull(deals.deletedAt)))
    .leftJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .where(
      and(
        inArray(activities.personId, personIds),
        eq(activities.done, false),
        isNull(activities.deletedAt),
        isNotNull(activities.dueAt),
      ),
    )
    .orderBy(activities.dueAt);
  signal.throwIfAborted();

  const earliest = new Map<string, Date>();
  for (const row of rows) {
    if (row.personId === null || row.dueAt === null || earliest.has(row.personId)) continue;
    if (row.deal !== null) {
      if (row.pipeArchived === true) continue;
      if (!canSee(actor, toVisibleDeal(row.deal, row.pipeVg))) continue;
    }
    earliest.set(row.personId, row.dueAt);
  }
  return earliest;
}

// List a deal's participants for the Summary count-link, the sidebar Participants section, and
// the participants table. Double-gated: the deal itself must be visible (pipeline-restriction
// hard gate via toVisibleDeal + canSee), and each participant PERSON is filtered by person-level
// visibility too, so a participant link cannot leak a restricted contact's name (the recurring
// entity-vs-activity leak class). The per-person deal COUNTS reuse dealsForPerson, so they only
// count deals the actor can see (no count-based probing of hidden deals).
export async function listParticipants(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  signal: AbortSignal,
): Promise<DealParticipant[]> {
  signal.throwIfAborted();
  const [row] = await db
    .select({ deal: deals, pipeVg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt), eq(pipelines.isArchived, false)));
  if (row === undefined || !canSee(actor, toVisibleDeal(row.deal, row.pipeVg))) return [];

  const primaryId = row.deal.personId;
  const linked = await db
    .select({ personId: dealParticipants.personId })
    .from(dealParticipants)
    .where(eq(dealParticipants.dealId, dealId));
  signal.throwIfAborted();
  const wantedIds = [
    ...new Set((primaryId === null ? [] : [primaryId]).concat(linked.map((l) => l.personId))),
  ];
  if (wantedIds.length === 0) return [];

  const people = await db
    .select({
      personId: persons.id,
      name: persons.name,
      primaryEmail: persons.primaryEmail,
      phones: persons.phones,
      orgName: organizations.name,
      orgOwnerId: organizations.ownerId,
      orgVisibilityLevel: organizations.visibilityLevel,
      orgVisibilityGroupId: organizations.visibilityGroupId,
      orgVisibleToUserIds: organizations.visibleToUserIds,
      ownerName: users.name,
      ownerId: persons.ownerId,
      visibilityLevel: persons.visibilityLevel,
      visibilityGroupId: persons.visibilityGroupId,
      visibleToUserIds: persons.visibleToUserIds,
    })
    .from(persons)
    .leftJoin(
      organizations,
      and(eq(organizations.id, persons.orgId), isNull(organizations.deletedAt)),
    )
    .leftJoin(users, eq(persons.ownerId, users.id))
    .where(and(inArray(persons.id, wantedIds), isNull(persons.deletedAt)));
  signal.throwIfAborted();

  const ordered = [...people].sort(
    (a, b) => Number(b.personId === primaryId) - Number(a.personId === primaryId),
  );
  const visible = ordered.filter((p) =>
    canSee(actor, {
      kind: "person",
      ownerId: p.ownerId,
      visibilityLevel: p.visibilityLevel,
      visibilityGroupId: p.visibilityGroupId,
      visibleToUserIds: p.visibleToUserIds,
    }),
  );
  if (visible.length === 0) return [];

  const explicitIds = new Set(linked.map((l) => l.personId));
  const nextByPerson = await nextActivityByPerson(
    db,
    actor,
    visible.map((p) => p.personId),
    signal,
  );

  // Per-person open/closed deal counts via the visibility-gated dealsForPerson (small N).
  const out: DealParticipant[] = [];
  for (const p of visible) {
    const personDeals = await dealsForPerson(db, actor, p.personId, signal);
    const closed = personDeals.filter((d) => d.status === "won" || d.status === "lost").length;
    out.push({
      personId: p.personId,
      name: p.name,
      isPrimary: p.personId === primaryId,
      isExplicit: explicitIds.has(p.personId),
      orgName: visibleOrgName(actor, p),
      primaryEmail: p.primaryEmail,
      phone: primaryPhone(p.phones),
      ownerName: p.ownerName,
      closedDeals: closed,
      openDeals: personDeals.length - closed,
      nextActivityAt: nextByPerson.get(p.personId) ?? null,
    });
  }
  return out;
}
