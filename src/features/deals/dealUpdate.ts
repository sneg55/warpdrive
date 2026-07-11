// updateDeal: compare-and-swap field update with won/lost transition rules and realtime event.
// Split from dealActions.ts to keep both files under 200 lines.
import { and, eq, sql } from "drizzle-orm";
import { BOARD_EVENT, dealChannel } from "@/constants/boardChannels";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema/deals";
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

// Shape assertReferenceVisible expects, built from the acting PermSetUser (mirrors
// participants.ts). Admin bypasses contact visibility inside canSee.
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

// A relink to a person/org must target a contact the actor can SEE, else the deal could be
// pointed at (or used to probe for) a hidden contact. Null (unlink) needs no check.
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

type DealPatch = Partial<typeof deals.$inferInsert>;

// Apply won/lost/open status transition: stamps or clears wonTime/lostTime/lostReason.
function applyStatusTransition(
  patch: DealPatch,
  status: "open" | "won" | "lost",
  lostReason: string | undefined,
  now: Date,
): void {
  patch.status = status;
  if (status === "won") {
    patch.wonTime = now;
    patch.lostTime = null;
    patch.lostReason = null;
  } else if (status === "lost") {
    patch.lostTime = now;
    patch.lostReason =
      lostReason !== undefined && lostReason.trim() !== "" ? lostReason.trim() : null;
    patch.wonTime = null;
  } else {
    // status = 'open': clear both timestamps and reason.
    patch.wonTime = null;
    patch.lostTime = null;
    patch.lostReason = null;
  }
}

// Build the column patch from validated input. Status transitions stamp/clear timestamps.
// visibilityGroupId is a visibility-narrowing field: when present it re-scopes a
// group-visibility deal. The caller (updateDealAction) must call scrubInaccessible
// after the transaction commits whenever this field appears in the input.
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
  // Primary person/org relink (visibility of a non-null target is gated separately).
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

  // Trust boundary (data-model 6.5): re-scoping visibility is allowed ONLY to a group the
  // actor belongs to. Mirrors the CREATE rule (dealActions.createDeal member-only check).
  // Without this, an editor could set visibilityGroupId to any group UUID, over-sharing.
  if (input.visibilityGroupId !== undefined && !session.groupIds.has(input.visibilityGroupId)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "visibility group not permitted: actor is not a member", {
        visibilityGroupId: input.visibilityGroupId,
      }),
    );
  }

  // Load deal + enforce can(deal.edit) via the single shared authorization path.
  const editable = await loadEditableDeal(db, session, input.dealId, signal);
  if (editable.ok === false) return editable;
  const before = editable.value.deal;

  const patch = buildPatch(input, new Date());
  // Partial custom-field edit: validate the supplied keys/values against the active deal defs
  // (the input schema is z.unknown(), so this is the only gate: reject unknown/archived keys and
  // wrong-typed values before they corrupt deals.custom_fields), then merge the coerced values over
  // the deal's existing JSONB so omitted keys are untouched (per-key changelog diff in logDealUpdateChanges).
  if (input.customFields !== undefined) {
    const validated = await validateDealCustomFieldsPartial(db, input.customFields, signal);
    if (validated.ok === false) return validated;
    patch.customFields = {
      ...(before.customFields as Record<string, unknown>),
      ...validated.value,
    };
  }

  return db.transaction(async (tx) => {
    // Relink target visibility (person/org): reject before the write so a hidden contact is
    // neither linked nor probeable. Runs on tx so the check and the write share a snapshot.
    const targetsVisible = await assertContactTargetsVisible(tx, session, input, signal);
    if (targetsVisible.ok === false) return targetsVisible;

    // Atomic CAS: single UPDATE WHERE id=:d AND date_trunc('milliseconds', updated_at)=:expected.
    // 0 rows means a concurrent write won; we write nothing.
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

    const row = updated[0];
    if (row === undefined) {
      throw new AppError(ERROR_IDS.DB_INVARIANT, "updateDeal: UPDATE RETURNING produced undefined");
    }

    // Audit trail (deal-history parity): one change_log row per field present-in-input AND
    // actually changed (labels/source_channel/title/value/expected_close plus
    // the Unit E additions: custom-field edits and person/org relink). Written on `tx` so a
    // failed mutation writes no changelog; a no-op edit logs nothing. `status` is excluded
    // (the won/lost flow owns it) to avoid double-logging.
    await logDealUpdateChanges(tx, { input, before, after: row, actorId: session.id }, signal);

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
