import { and, eq, sql } from "drizzle-orm";
import { BOARD_EVENT, dealChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema/deals";
import { enqueueDealSearchRefresh } from "@/features/intercom/dealSearch/enqueue";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { publishBoardEvent } from "@/server/realtime/events";
import { err, ok, type Result } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";
import { loadEditableDeal } from "./dealAuth";
import { validateDealCustomFieldsPartial } from "./dealCustomFieldsValidation";
import { logDealUpdateChanges } from "./dealUpdateChangeLog";
import { type DealUpdateInput, dealUpdateInput } from "./schemas";
import { applyStatusTransition, type DealPatch } from "./statusTransition";

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

async function assertContactTargetsVisible(
  tx: DbOrTx,
  actor: PermSetUser,
  input: DealUpdateInput,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const refActor = toRefActor(actor);
  if (input.personId !== undefined && input.personId !== null) {
    const r = await assertReferenceVisible(
      tx,
      refActor,
      { kind: "person", id: input.personId },
      signal,
    );
    if (r.ok === false) return r;
  }
  if (input.orgId !== undefined && input.orgId !== null) {
    const r = await assertReferenceVisible(
      tx,
      refActor,
      { kind: "organization", id: input.orgId },
      signal,
    );
    if (r.ok === false) return r;
  }
  return ok(undefined);
}

function buildPatch(input: DealUpdateInput, now: Date): DealPatch {
  const patch: DealPatch = { updatedAt: now };
  if (input.title !== undefined) patch.title = input.title;
  if (input.value !== undefined) patch.value = input.value === null ? null : input.value.toFixed(2);
  if (input.expectedCloseDate !== undefined) patch.expectedCloseDate = input.expectedCloseDate;
  if (input.status !== undefined) applyStatusTransition(patch, input.status, input.lostReason, now);
  if (input.labels !== undefined) patch.labels = input.labels;
  if (input.sourceChannel !== undefined) patch.sourceChannel = input.sourceChannel;
  if (input.sourceChannelId !== undefined) patch.sourceChannelId = input.sourceChannelId;
  if (input.visibilityGroupId !== undefined) patch.visibilityGroupId = input.visibilityGroupId;
  if (input.personId !== undefined) patch.personId = input.personId;
  if (input.orgId !== undefined) patch.orgId = input.orgId;
  return patch;
}

export async function updateDeal(
  db: DbOrTx,
  session: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<typeof deals.$inferSelect, AppError>> {
  const input = dealUpdateInput.parse(raw);
  signal.throwIfAborted();

  if (input.visibilityGroupId !== undefined && !session.groupIds.has(input.visibilityGroupId)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "visibility group not permitted: actor is not a member", {
        visibilityGroupId: input.visibilityGroupId,
      }),
    );
  }

  const editable = await loadEditableDeal(db, session, input.dealId, signal);
  if (editable.ok === false) return editable;
  const before = editable.value.deal;

  const patch = buildPatch(input, new Date());
  if (input.customFields !== undefined) {
    const validated = await validateDealCustomFieldsPartial(db, input.customFields, signal);
    if (validated.ok === false) return validated;
    patch.customFields = {
      ...(before.customFields as Record<string, unknown>),
      ...validated.value,
    };
  }

  return db.transaction(async (tx) => {
    const targetsVisible = await assertContactTargetsVisible(tx, session, input, signal);
    if (targetsVisible.ok === false) return targetsVisible;

    const updated = await tx
      .update(deals)
      .set(patch)
      .where(
        and(
          eq(deals.id, input.dealId),
          sql`date_trunc('milliseconds', ${deals.updatedAt}) = ${input.expectedUpdatedAt}::timestamptz`,
        ),
      )
      .returning();

    if (updated.length === 0) {
      return err(
        new AppError(ERROR_IDS.DEAL_PRECONDITION, "Deal was modified by a concurrent request", {
          dealId: input.dealId,
        }),
      );
    }
    if (input.personId !== undefined && input.personId !== before.personId) {
      await enqueueDealSearchRefresh(tx, [input.dealId], signal);
    }

    const row = updated[0];
    if (row === undefined) {
      throw new AppError(ERROR_IDS.DB_INVARIANT, "updateDeal: UPDATE RETURNING produced undefined");
    }

    await logDealUpdateChanges(tx, { input, before, after: row, actorId: session.id }, signal);

    if (input.labels !== undefined) {
      await syncEntityLabelNames(tx, "deal", row.id, row.labels, signal);
    }

    await publishBoardEvent(
      tx,
      {
        channel: dealChannel(row.id),
        type: BOARD_EVENT.dealUpdated,
        actorId: session.id,
        data: { dealId: row.id },
      },
      signal,
    );

    return ok(row);
  });
}
