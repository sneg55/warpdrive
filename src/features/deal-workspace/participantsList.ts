// Enriched read for a deal's participants (PD-parity participants table + Summary count-link +
// sidebar section). Split from participants.ts (mutations + org/person aggregations) to keep
// both under the file-size cap.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

  const people = await db
    .select({
      personId: dealParticipants.personId,
      name: persons.name,
      primaryEmail: persons.primaryEmail,
      phones: persons.phones,
      orgName: organizations.name,
      ownerName: users.name,
      ownerId: persons.ownerId,
      visibilityLevel: persons.visibilityLevel,
      visibilityGroupId: persons.visibilityGroupId,
      visibleToUserIds: persons.visibleToUserIds,
    })
    .from(dealParticipants)
    .innerJoin(persons, eq(dealParticipants.personId, persons.id))
    .leftJoin(organizations, eq(persons.orgId, organizations.id))
    .leftJoin(users, eq(persons.ownerId, users.id))
    .where(and(eq(dealParticipants.dealId, dealId), isNull(persons.deletedAt)));
  signal.throwIfAborted();

  const visible = people.filter((p) =>
    canSee(actor, {
      kind: "person",
      ownerId: p.ownerId,
      visibilityLevel: p.visibilityLevel,
      visibilityGroupId: p.visibilityGroupId,
      visibleToUserIds: p.visibleToUserIds,
    }),
  );
  if (visible.length === 0) return [];

  const personIds = visible.map((p) => p.personId);

  // Next planned (not-done) activity per person, computed over the visible participants only.
  const nextActs = await db
    .select({
      personId: activities.personId,
      nextAt: sql<string | null>`min(${activities.dueAt})`,
    })
    .from(activities)
    .where(
      and(
        inArray(activities.personId, personIds),
        eq(activities.done, false),
        isNull(activities.deletedAt),
      ),
    )
    .groupBy(activities.personId);
  const nextByPerson = new Map(nextActs.map((a) => [a.personId, a.nextAt]));
  signal.throwIfAborted();

  // Per-person open/closed deal counts via the visibility-gated dealsForPerson (small N).
  const out: DealParticipant[] = [];
  for (const p of visible) {
    const personDeals = await dealsForPerson(db, actor, p.personId, signal);
    const closed = personDeals.filter((d) => d.status === "won" || d.status === "lost").length;
    const nextRaw = nextByPerson.get(p.personId) ?? null;
    out.push({
      personId: p.personId,
      name: p.name,
      orgName: p.orgName,
      primaryEmail: p.primaryEmail,
      phone: primaryPhone(p.phones),
      ownerName: p.ownerName,
      closedDeals: closed,
      openDeals: personDeals.length - closed,
      nextActivityAt: nextRaw !== null ? new Date(nextRaw) : null,
    });
  }
  return out;
}
