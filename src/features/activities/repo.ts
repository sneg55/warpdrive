import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import {
  type Activity,
  activities,
  activityGuests,
  activityParticipants,
  deals,
} from "@/db/schema";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { buildCustomFieldsSchema } from "@/features/custom-fields/validate";
import { sanitizeAuthorHtml } from "@/features/email/sanitizeHtml";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import { recomputeNextActivity } from "./nextActivity";
import { scheduleReminder } from "./reminders";
import { type ActivityCreateInput, activityCreateInput } from "./schemas";
import { resolveActivityVisibility } from "./visibility";

// Pipedrive parity: block linking a new activity to an archived deal. Extracted so
// createActivity stays under the cognitive-complexity budget. No-op when dealId is null.
async function assertDealNotArchived(
  tx: DbOrTx,
  dealId: string | null,
  signal: AbortSignal,
): Promise<Result<undefined, AppError>> {
  if (dealId === null) return ok(undefined);
  signal.throwIfAborted();
  const [dealRow] = await tx
    .select({ archivedAt: deals.archivedAt })
    .from(deals)
    .where(eq(deals.id, dealId));
  signal.throwIfAborted();
  if (dealRow?.archivedAt != null) {
    return err(
      new AppError(
        ERROR_IDS.DEAL_ARCHIVED_NO_ACTIVITY,
        "Cannot add an activity to an archived deal",
        { dealId },
      ),
    );
  }
  return ok(undefined);
}

// Sanitize the raw note HTML before it reaches Postgres. Extracted (alongside
// resolveDoneAt below) so createActivity stays under the cognitive-complexity budget.
function sanitizeNote(note: string | null): string | null {
  return note === null ? null : sanitizeAuthorHtml(note);
}

// Resolve doneAt from the done flag on create.
function resolveDoneAt(done: boolean): Date | null {
  return done ? new Date() : null;
}

// Multi-day guard: a provided endAt must not precede the start (dueAt). Both are ISO strings
// at this point. No-op when either bound is absent (a dateless or open-ended activity).
export function assertEndNotBeforeStart(
  dueAt: string | null,
  endAt: string | null,
): Result<undefined, AppError> {
  if (dueAt === null || endAt === null) return ok(undefined);
  if (new Date(endAt).getTime() < new Date(dueAt).getTime()) {
    return err(
      new AppError(ERROR_IDS.ACTIVITY_END_BEFORE_START, "activity end is before its start", {
        dueAt,
        endAt,
      }),
    );
  }
  return ok(undefined);
}

type RefKind = "deal" | "lead" | "person" | "organization" | "user";

// Collect every entity a create payload references, so createActivity can visibility-gate them
// in one loop. Extracted to keep createActivity under the cognitive-complexity budget.
function collectReferences(input: {
  dealId: string | null;
  leadId: string | null;
  personId: string | null;
  orgId: string | null;
  assigneeId?: string;
  guestPersonIds: string[];
  participantUserIds: string[];
}): Array<{ kind: RefKind; id: string }> {
  const refs: Array<{ kind: RefKind; id: string }> = [];
  const singleRefs: Array<[RefKind, string | null | undefined]> = [
    ["deal", input.dealId],
    ["lead", input.leadId],
    ["person", input.personId],
    ["organization", input.orgId],
    ["user", input.assigneeId],
  ];
  for (const [kind, id] of singleRefs) {
    if (id !== null && id !== undefined) refs.push({ kind, id });
  }
  for (const gid of input.guestPersonIds) refs.push({ kind: "person", id: gid });
  for (const uid of input.participantUserIds) refs.push({ kind: "user", id: uid });
  return refs;
}

// Build a DealVisibilitySession from a PermSetUser for assertReferenceVisible.
function toVisibilitySession(actor: PermSetUser) {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export async function createActivity(
  db: Db,
  actor: PermSetUser,
  raw: ActivityCreateInput,
  signal: AbortSignal,
): Promise<Result<Activity, AppError>> {
  // Parse at the boundary so defaulted fields (priority, dueAt, arrays) are always present.
  const input = activityCreateInput.parse(raw);
  const defs = await listDefs(db, "activity", {}, signal);
  const cf = buildCustomFieldsSchema(defs).safeParse(input.customFields);
  if (!cf.success) {
    return err(
      new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom fields invalid", {
        issues: cf.error.issues,
      }),
    );
  }

  const orderCheck = assertEndNotBeforeStart(input.dueAt, input.endAt);
  if (!orderCheck.ok) return orderCheck;

  const refActor = toVisibilitySession(actor);

  const result = await db.transaction(async (tx) => {
    // Validate all referenced entities are visible to the actor. A lead reference is gated
    // here too, so an actor cannot attach an activity to a lead they cannot see.
    const refs = collectReferences(input);
    for (const ref of refs) {
      const v = await assertReferenceVisible(tx, refActor, ref, signal);
      if (!v.ok) return v;
    }

    // Pipedrive parity: you cannot link a new activity to an archived deal.
    const guard = await assertDealNotArchived(tx, input.dealId, signal);
    if (!guard.ok) return guard;

    const [row] = await tx
      .insert(activities)
      .values({
        typeId: input.typeId,
        subject: input.subject,
        priority: input.priority,
        dueAt: input.dueAt === null ? null : new Date(input.dueAt),
        endAt: input.endAt === null ? null : new Date(input.endAt),
        durationMinutes: input.durationMinutes,
        ownerId: actor.id,
        assigneeId: input.assigneeId ?? actor.id,
        dealId: input.dealId,
        leadId: input.leadId,
        personId: input.personId,
        orgId: input.orgId,
        customFields: cf.data,
        location: input.location,
        note: sanitizeNote(input.note),
        videoCallUrl: input.videoCallUrl,
        done: input.done,
        doneAt: resolveDoneAt(input.done),
      })
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "activity insert returned no rows", {}));
    }

    if (input.guestPersonIds.length > 0) {
      await tx
        .insert(activityGuests)
        .values(input.guestPersonIds.map((personId) => ({ activityId: row.id, personId })));
    }
    if (input.participantUserIds.length > 0) {
      await tx
        .insert(activityParticipants)
        .values(input.participantUserIds.map((userId) => ({ activityId: row.id, userId })));
    }

    if (row.dealId !== null) {
      await recomputeNextActivity(tx, row.dealId, signal);
    }

    return ok(row);
  });

  // Schedule the reminder only AFTER the tx commits: a rolled-back create must not
  // leave a queued job. No-op in tests/scripts with no queue; throws in production.
  if (result.ok === true) {
    await scheduleReminder(result.value.id, result.value.dueAt, signal);
  }
  return result;
}

export async function completeActivity(
  db: Db,
  actor: PermSetUser,
  id: string,
  done: boolean,
  signal: AbortSignal,
): Promise<Result<Activity, AppError>> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.id, id), isNull(activities.deletedAt)));

    if (current === undefined) {
      return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id }));
    }

    const vis = await resolveActivityVisibility(tx, current, signal);

    if (vis === null || !canSee(actor, vis)) {
      // Invisible: return 404-on-invisible, not 403.
      return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id }));
    }

    if (!can(actor, "activity.complete", vis)) {
      return err(new AppError(ERROR_IDS.ACTIVITY_FORBIDDEN, "forbidden", { id }));
    }

    const [row] = await tx
      .update(activities)
      .set({ done, doneAt: done ? new Date() : null })
      .where(eq(activities.id, id))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "activity update returned no rows", {}));
    }

    if (row.dealId !== null) {
      await recomputeNextActivity(tx, row.dealId, signal);
    }

    return ok(row);
  });
}
