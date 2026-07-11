import { asc, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type LostReason, lostReasons } from "@/db/schema/lostReasons";
import { err, ok, type Result } from "@/types/result";

// Lost-reason catalog CRUD (settings spec 6.3). Archive is a soft-delete (archivedAt) because
// historical won/lost deals reference the reason; the deal-close picker filters archived out.

export async function listLostReasons(db: Db, signal: AbortSignal): Promise<LostReason[]> {
  signal.throwIfAborted();
  return db
    .select()
    .from(lostReasons)
    .where(isNull(lostReasons.archivedAt))
    .orderBy(asc(lostReasons.order));
}

export async function createLostReason(
  db: Db,
  input: { name: string },
  signal: AbortSignal,
): Promise<Result<LostReason, AppError>> {
  signal.throwIfAborted();
  const [row] = await db.insert(lostReasons).values({ name: input.name }).returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
  }
  return ok(row);
}

export async function renameLostReason(
  db: Db,
  input: { id: string; name: string },
  signal: AbortSignal,
): Promise<Result<LostReason, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(lostReasons)
    .set({ name: input.name })
    .where(eq(lostReasons.id, input.id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.LOST_REASON_NOT_FOUND, "lost reason not found", input));
  }
  return ok(row);
}

export async function reorderLostReasons(
  db: Db,
  orderedIds: string[],
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id === undefined) continue;
      await tx.update(lostReasons).set({ order: i }).where(eq(lostReasons.id, id));
    }
  });
  return ok(true);
}

export async function archiveLostReason(
  db: Db,
  input: { id: string },
  signal: AbortSignal,
): Promise<Result<LostReason, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(lostReasons)
    .set({ archivedAt: new Date() })
    .where(eq(lostReasons.id, input.id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.LOST_REASON_NOT_FOUND, "lost reason not found", input));
  }
  return ok(row);
}
