// Deal participant linking (M:N person<->deal) + org/person deal aggregation.
// Mutations reuse loadEditableDeal (single deal-auth authority). Reads reuse
// toVisibleDeal + canSee so the pipeline-restriction hard gate always runs (a raw
// deal-row spread would omit pipelineVisibilityGroupId and leak restricted deals).
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { CHANGE_FIELD_PARTICIPANT } from "@/constants/changeLogFields";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Deal } from "@/db/schema";
import { dealParticipants, deals, persons, pipelines } from "@/db/schema";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal, toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { ok, type Result } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";

// Build the DealVisibilitySession assertReferenceVisible expects from a PermSetUser.
function toRefActor(actor: PermSetUser): DealVisibilitySession {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export async function addParticipant(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  personId: string,
  role: string | null,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return db.transaction(async (tx) => {
    // 404 DEAL_NOT_FOUND / 403 PERM_DENIED, with a correctly-built VisibleDeal.
    const editable = await loadEditableDeal(tx, actor, dealId, signal);
    if (editable.ok === false) return editable;

    // Person must be visible to the actor too (CONTACT_NOT_FOUND if hidden).
    const personRef = await assertReferenceVisible(
      tx,
      toRefActor(actor),
      { kind: "person", id: personId },
      signal,
    );
    if (personRef.ok === false) return personRef;

    // .returning() distinguishes a real insert from the idempotent conflict no-op, so a
    // double-add logs nothing. recordChange runs on tx (atomic with the link).
    const inserted = await tx
      .insert(dealParticipants)
      .values({ dealId, personId, role })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: dealId,
          field: CHANGE_FIELD_PARTICIPANT,
          oldValue: null,
          newValue: personId,
          actorId: actor.id,
        },
        signal,
      );
    }
    return ok(undefined);
  });
}

export async function removeParticipant(
  db: Db,
  actor: PermSetUser,
  dealId: string,
  personId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return db.transaction(async (tx) => {
    const editable = await loadEditableDeal(tx, actor, dealId, signal);
    if (editable.ok === false) return editable;

    // .returning() distinguishes a real delete from remove-when-absent, so an unlink of a
    // non-participant logs nothing.
    const deleted = await tx
      .delete(dealParticipants)
      .where(and(eq(dealParticipants.dealId, dealId), eq(dealParticipants.personId, personId)))
      .returning();
    if (deleted.length > 0) {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: dealId,
          field: CHANGE_FIELD_PARTICIPANT,
          oldValue: personId,
          newValue: null,
          actorId: actor.id,
        },
        signal,
      );
    }
    return ok(undefined);
  });
}

export async function dealsForPerson(
  db: Db,
  actor: PermSetUser,
  personId: string,
  signal: AbortSignal,
): Promise<Deal[]> {
  signal.throwIfAborted();

  const participantDealIds = (
    await db
      .select({ dealId: dealParticipants.dealId })
      .from(dealParticipants)
      .where(eq(dealParticipants.personId, personId))
  ).map((r) => r.dealId);

  const rows = await db
    .select({ deal: deals, pipeVg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(
      and(
        isNull(deals.deletedAt),
        // Archived-pipeline deals are hidden from every read (F7/F15/F16/F21-F24).
        eq(pipelines.isArchived, false),
        or(
          eq(deals.personId, personId),
          participantDealIds.length > 0 ? inArray(deals.id, participantDealIds) : undefined,
        ),
      ),
    );

  signal.throwIfAborted();
  return rows.filter((r) => canSee(actor, toVisibleDeal(r.deal, r.pipeVg))).map((r) => r.deal);
}

export async function dealsForOrg(
  db: Db,
  actor: PermSetUser,
  orgId: string,
  signal: AbortSignal,
): Promise<Deal[]> {
  signal.throwIfAborted();

  // People belonging to the org -> the deals they participate in (data-model §6).
  const orgPersonIds = (
    await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.orgId, orgId), isNull(persons.deletedAt)))
  ).map((r) => r.id);

  const participantDealIds =
    orgPersonIds.length === 0
      ? []
      : (
          await db
            .select({ dealId: dealParticipants.dealId })
            .from(dealParticipants)
            .where(inArray(dealParticipants.personId, orgPersonIds))
        ).map((r) => r.dealId);

  const rows = await db
    .select({ deal: deals, pipeVg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(
      and(
        isNull(deals.deletedAt),
        // Archived-pipeline deals are hidden from every read (F7/F15/F16/F21-F24).
        eq(pipelines.isArchived, false),
        or(
          eq(deals.orgId, orgId),
          participantDealIds.length > 0 ? inArray(deals.id, participantDealIds) : undefined,
        ),
      ),
    );

  signal.throwIfAborted();
  return rows.filter((r) => canSee(actor, toVisibleDeal(r.deal, r.pipeVg))).map((r) => r.deal);
}
