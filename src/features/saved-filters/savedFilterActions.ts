import { and, eq, not, or } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { savedFilters } from "@/db/schema/savedFilters";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import {
  asTargetEntity,
  type FilterSession,
  type SavedFilterPatch,
  type SaveFilterArgs,
} from "./savedFilterInputs";
import {
  type SavedFilterTargetEntity,
  saveFilterInput,
  updateSavedFilterInputFor,
} from "./schemas";

export async function saveFilter(
  db: DbOrTx,
  session: FilterSession,
  raw: SaveFilterArgs,
  signal: AbortSignal,
): Promise<Result<typeof savedFilters.$inferSelect, AppError>> {
  const parsed = saveFilterInput.safeParse(raw);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "invalid saved filter", {
        issues: parsed.error.issues,
      }),
    );
  }
  const input = parsed.data;
  signal.throwIfAborted();

  if (
    input.isShared === true &&
    session.isAdmin !== true &&
    session.flags["filter.share"] !== true
  ) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "Not permitted to share filters", {
        userId: session.userId,
      }),
    );
  }

  const rows = await db
    .insert(savedFilters)
    .values({
      name: input.name,
      targetEntity: input.targetEntity,
      definition: input.definition,
      ownerId: session.userId,
      isShared: input.isShared,
    })
    .returning();

  const row = rows[0];
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "saveFilter: insert returned no rows"));
  }

  return ok(row);
}

export async function listSavedFilters(
  db: DbOrTx,
  session: FilterSession,
  targetEntity: SavedFilterTargetEntity,
  signal: AbortSignal,
): Promise<Array<typeof savedFilters.$inferSelect>> {
  signal.throwIfAborted();
  return db
    .select()
    .from(savedFilters)
    .where(
      and(
        eq(savedFilters.targetEntity, targetEntity),
        or(eq(savedFilters.ownerId, session.userId), eq(savedFilters.isShared, true)),
      ),
    );
}

export async function removeSavedFilter(
  db: DbOrTx,
  session: FilterSession,
  id: string,
  signal: AbortSignal,
): Promise<Result<undefined, AppError>> {
  signal.throwIfAborted();
  const deleted = await db
    .delete(savedFilters)
    .where(and(eq(savedFilters.id, id), eq(savedFilters.ownerId, session.userId)))
    .returning({ id: savedFilters.id });
  if (deleted.length === 0) {
    return err(
      new AppError(ERROR_IDS.DEAL_SAVED_FILTER_NOT_FOUND, "saved filter not found or not owned", {
        id,
      }),
    );
  }
  return ok(undefined);
}

export async function updateSavedFilter(
  db: DbOrTx,
  session: FilterSession,
  id: string,
  raw: SavedFilterPatch,
  signal: AbortSignal,
): Promise<Result<typeof savedFilters.$inferSelect, AppError>> {
  signal.throwIfAborted();
  const [existing] = await db
    .select({ targetEntity: savedFilters.targetEntity })
    .from(savedFilters)
    .where(and(eq(savedFilters.id, id), eq(savedFilters.ownerId, session.userId)))
    .limit(1);
  const entity = existing === undefined ? null : asTargetEntity(existing.targetEntity);
  if (entity === null) {
    return err(
      new AppError(ERROR_IDS.DEAL_SAVED_FILTER_NOT_FOUND, "saved filter not found or not owned", {
        id,
      }),
    );
  }

  const parsed = updateSavedFilterInputFor(entity).safeParse(raw);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "invalid saved filter", {
        issues: parsed.error.issues,
      }),
    );
  }
  const patch = parsed.data;
  signal.throwIfAborted();

  if (
    patch.isShared === true &&
    session.isAdmin !== true &&
    session.flags["filter.share"] !== true
  ) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "Not permitted to share filters", {
        userId: session.userId,
      }),
    );
  }

  const rows = await db
    .update(savedFilters)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
      ...(patch.isShared !== undefined ? { isShared: patch.isShared } : {}),
    })
    .where(and(eq(savedFilters.id, id), eq(savedFilters.ownerId, session.userId)))
    .returning();

  const row = rows[0];
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.DEAL_SAVED_FILTER_NOT_FOUND, "saved filter not found or not owned", {
        id,
      }),
    );
  }
  return ok(row);
}

export async function toggleFavorite(
  db: DbOrTx,
  session: FilterSession,
  id: string,
  signal: AbortSignal,
): Promise<Result<typeof savedFilters.$inferSelect, AppError>> {
  signal.throwIfAborted();
  const rows = await db
    .update(savedFilters)
    .set({ favorite: not(savedFilters.favorite) })
    .where(and(eq(savedFilters.id, id), eq(savedFilters.ownerId, session.userId)))
    .returning();
  const row = rows[0];
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.DEAL_SAVED_FILTER_NOT_FOUND, "saved filter not found or not owned", {
        id,
      }),
    );
  }
  return ok(row);
}
