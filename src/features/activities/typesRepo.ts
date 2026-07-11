import { asc, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { activities } from "@/db/schema/activities";
import { type ActivityType, activityTypes } from "@/db/schema/activityTypes";
import { err, ok, type Result } from "@/types/result";

// Activity-type catalog CRUD (settings spec 6.2). Admin gating lives in typeActions.ts;
// these repo functions take no actor. Enable/disable is a soft archive (archivedAt) because
// activities reference the row via type_id and must never dangle.

export async function listTypes(
  db: Db,
  opts: { activeOnly?: boolean },
  signal: AbortSignal,
): Promise<ActivityType[]> {
  signal.throwIfAborted();
  const base = db.select().from(activityTypes);
  const rows =
    opts.activeOnly === true
      ? await base.where(isNull(activityTypes.archivedAt)).orderBy(asc(activityTypes.order))
      : await base.orderBy(asc(activityTypes.order));
  return rows;
}

export async function createType(
  db: Db,
  input: { key: string; name: string; icon?: string | null },
  signal: AbortSignal,
): Promise<Result<ActivityType, AppError>> {
  signal.throwIfAborted();
  // Pre-check the unique key (two names can slugify to the same key) so a duplicate returns a
  // clean error instead of an uncaught unique-violation, mirroring createDef's CF_KEY_EXISTS.
  const [existing] = await db
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(eq(activityTypes.key, input.key));
  signal.throwIfAborted();
  if (existing !== undefined) {
    return err(
      new AppError(ERROR_IDS.ACTIVITY_TYPE_KEY_EXISTS, "An activity type with that key exists", {
        key: input.key,
      }),
    );
  }
  const [row] = await db
    .insert(activityTypes)
    .values({ key: input.key, name: input.name, icon: input.icon ?? null })
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
  }
  return ok(row);
}

export async function renameType(
  db: Db,
  input: { id: string; name: string },
  signal: AbortSignal,
): Promise<Result<ActivityType, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(activityTypes)
    .set({ name: input.name })
    .where(eq(activityTypes.id, input.id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity type not found", input));
  }
  return ok(row);
}

export async function reorderTypes(
  db: Db,
  orderedIds: string[],
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id === undefined) continue;
      await tx.update(activityTypes).set({ order: i }).where(eq(activityTypes.id, id));
    }
  });
  return ok(true);
}

export async function setTypeActive(
  db: Db,
  input: { id: string; active: boolean },
  signal: AbortSignal,
): Promise<Result<ActivityType, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(activityTypes)
    .set({ archivedAt: input.active ? null : new Date() })
    .where(eq(activityTypes.id, input.id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity type not found", input));
  }
  return ok(row);
}

export async function deleteType(
  db: Db,
  input: { id: string },
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  const [type] = await db
    .select({ isSystem: activityTypes.isSystem })
    .from(activityTypes)
    .where(eq(activityTypes.id, input.id));
  if (type === undefined) {
    return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity type not found", input));
  }
  if (type.isSystem) {
    return err(new AppError(ERROR_IDS.ACTIVITY_TYPE_IN_USE, "cannot delete a system type", input));
  }
  const [used] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.typeId, input.id))
    .limit(1);
  if (used !== undefined) {
    return err(
      new AppError(ERROR_IDS.ACTIVITY_TYPE_IN_USE, "activity type is referenced by an activity", {
        id: input.id,
      }),
    );
  }
  signal.throwIfAborted();
  await db.delete(activityTypes).where(eq(activityTypes.id, input.id));
  return ok(true);
}
