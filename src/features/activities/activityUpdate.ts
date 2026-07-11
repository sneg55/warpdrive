import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type Activity, activities, activityTypes } from "@/db/schema";
import { sanitizeAuthorHtml } from "@/features/email/sanitizeHtml";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import { recomputeNextActivity } from "./nextActivity";
import { type ActivityUpdateInput, activityUpdateInput } from "./schemas";
import { resolveActivityVisibility } from "./visibility";

type ParsedUpdate = z.infer<typeof activityUpdateInput>;

// Mirror of repo.ts's toVisibilitySession: builds a DealVisibilitySession from a
// PermSetUser so assertReferenceVisible can gate the assigneeId reference.
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

// A patched typeId must reference an existing, non-archived activity type. Archived types
// stay valid on rows that already reference them, but must not be assignable going forward.
async function assertTypeActive(
  tx: DbOrTx,
  typeId: string,
  signal: AbortSignal,
): Promise<Result<undefined, AppError>> {
  const [row] = await tx
    .select({ archivedAt: activityTypes.archivedAt })
    .from(activityTypes)
    .where(eq(activityTypes.id, typeId));
  signal.throwIfAborted();
  if (row === undefined || row.archivedAt !== null) {
    return err(
      new AppError(ERROR_IDS.ACTIVITY_TYPE_INVALID, "activity type not found or archived", {
        typeId,
      }),
    );
  }
  return ok(undefined);
}

// Only include columns the patch actually provided (activityUpdateInput.refine already requires
// at least one), so an omitted field never clobbers existing data with an implicit null write.
// Re-sanitizes note through the same helper createActivity uses (sanitizeAuthorHtml).
function buildPatch(input: ParsedUpdate): Partial<typeof activities.$inferInsert> {
  const patch: Partial<typeof activities.$inferInsert> = {};
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.typeId !== undefined) patch.typeId = input.typeId;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueAt !== undefined) {
    patch.dueAt = input.dueAt === null ? null : new Date(input.dueAt);
  }
  if (input.endAt !== undefined) {
    patch.endAt = input.endAt === null ? null : new Date(input.endAt);
  }
  if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes;
  if (input.location !== undefined) patch.location = input.location;
  if (input.note !== undefined) {
    patch.note = input.note === null ? null : sanitizeAuthorHtml(input.note);
  }
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  return patch;
}

// Validate the referenced entities a patch may touch (currently only assigneeId) are visible
// to the actor, mirroring createActivity's reference gate.
async function assertPatchRefsVisible(
  tx: DbOrTx,
  actor: PermSetUser,
  input: ParsedUpdate,
  signal: AbortSignal,
): Promise<Result<undefined, AppError>> {
  if (input.typeId !== undefined) {
    const typeCheck = await assertTypeActive(tx, input.typeId, signal);
    if (!typeCheck.ok) return typeCheck;
  }
  if (input.assigneeId !== undefined) {
    const refActor = toVisibilitySession(actor);
    const refCheck = await assertReferenceVisible(
      tx,
      refActor,
      { kind: "user", id: input.assigneeId },
      signal,
    );
    if (!refCheck.ok) return refCheck;
  }
  return ok(undefined);
}

// Multi-day guard for edits: the effective end (patched or current) must not precede the
// effective start (patched or current). No-op when either resolved bound is null.
function assertUpdateEndOrder(current: Activity, input: ParsedUpdate): Result<undefined, AppError> {
  const start = input.dueAt !== undefined ? toDate(input.dueAt) : current.dueAt;
  const end = input.endAt !== undefined ? toDate(input.endAt) : current.endAt;
  if (start === null || end === null) return ok(undefined);
  if (end.getTime() < start.getTime()) {
    return err(
      new AppError(ERROR_IDS.ACTIVITY_END_BEFORE_START, "activity end is before its start", {
        id: current.id,
      }),
    );
  }
  return ok(undefined);
}

function toDate(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso);
}

export async function updateActivity(
  db: Db,
  actor: PermSetUser,
  raw: ActivityUpdateInput,
  signal: AbortSignal,
): Promise<Result<Activity, AppError>> {
  const parsed = activityUpdateInput.safeParse(raw);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.ACTIVITY_UPDATE_INPUT_INVALID, "activity update input invalid", {
        issues: parsed.error.issues,
      }),
    );
  }
  const input = parsed.data;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.id, input.id), isNull(activities.deletedAt)));

    if (current === undefined) {
      return err(
        new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id: input.id }),
      );
    }

    const vis = await resolveActivityVisibility(tx, current, signal);

    if (vis === null || !canSee(actor, vis)) {
      // Invisible: return 404-on-invisible, not 403.
      return err(
        new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id: input.id }),
      );
    }

    if (!can(actor, "activity.edit", vis)) {
      return err(new AppError(ERROR_IDS.ACTIVITY_FORBIDDEN, "forbidden", { id: input.id }));
    }

    const refsOk = await assertPatchRefsVisible(tx, actor, input, signal);
    if (!refsOk.ok) return refsOk;

    const orderOk = assertUpdateEndOrder(current, input);
    if (!orderOk.ok) return orderOk;

    const [row] = await tx
      .update(activities)
      .set(buildPatch(input))
      .where(eq(activities.id, input.id))
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
