import { and, asc, eq, isNull } from "drizzle-orm";
import type { CustomFieldTarget, CustomFieldType } from "@/constants/customFieldTypes";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type CustomFieldDefRow, customFieldDefs } from "@/db/schema";
import { createDbCache } from "@/lib/dbCache";
import type { CustomFieldDef, CustomFieldOption } from "@/types/customFields";
import { err, ok, type Result } from "@/types/result";

// Custom-field defs change only when an admin edits Settings > Data fields, yet they are read on
// every entity create/update validation and every list render. Cache them per Db instance so those
// hot reads stop re-scanning custom_field_defs; every mutation below invalidates the Db's entry,
// and the short TTL self-heals if an invalidation is ever missed.
const defsCache = createDbCache<CustomFieldDef[]>(10_000);

function defsCacheKey(target: CustomFieldTarget, includeArchived: boolean): string {
  return `${target}:${includeArchived ? "all" : "active"}`;
}

export type CreateDefInput = {
  targetEntity: CustomFieldTarget;
  type: CustomFieldType;
  name: string;
  options?: CustomFieldOption[];
  isRequired?: boolean;
  order?: number;
};

export function toDef(row: CustomFieldDefRow): CustomFieldDef {
  return {
    id: row.id,
    targetEntity: row.targetEntity,
    type: row.type,
    name: row.name,
    key: row.key,
    options: row.options,
    isRequired: row.isRequired,
    isImportant: row.isImportant,
    showInAddForm: row.showInAddForm,
    order: row.order,
    archivedAt: row.archivedAt,
  };
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function listDefs(
  db: Db,
  target: CustomFieldTarget,
  opts: { includeArchived?: boolean },
  signal: AbortSignal,
): Promise<CustomFieldDef[]> {
  signal.throwIfAborted();
  const includeArchived = opts.includeArchived === true;
  const key = defsCacheKey(target, includeArchived);
  const cached = defsCache.get(db, key);
  if (cached !== undefined) return cached;
  const where = includeArchived
    ? eq(customFieldDefs.targetEntity, target)
    : and(eq(customFieldDefs.targetEntity, target), isNull(customFieldDefs.archivedAt));
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(where)
    // Stable tiebreak on id: newly created defs all start at order 0 until reordered, and a
    // partial reorder can leave duplicate order values, so id keeps the list deterministic.
    .orderBy(asc(customFieldDefs.order), asc(customFieldDefs.id));
  const defs = rows.map(toDef);
  defsCache.set(db, key, defs);
  return defs;
}

export async function createDef(
  db: Db,
  input: CreateDefInput,
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  signal.throwIfAborted();
  const key = slugify(input.name);
  const existing = await db
    .select({ id: customFieldDefs.id })
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.targetEntity, input.targetEntity), eq(customFieldDefs.key, key)));
  if (existing.length > 0) {
    return err(
      new AppError(ERROR_IDS.CF_KEY_EXISTS, "custom-field key already exists", {
        target: input.targetEntity,
        key,
      }),
    );
  }
  const [row] = await db
    .insert(customFieldDefs)
    .values({
      targetEntity: input.targetEntity,
      type: input.type,
      name: input.name,
      key,
      options: input.options ?? [],
      isRequired: input.isRequired ?? false,
      order: input.order ?? 0,
    })
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
  }
  defsCache.invalidate(db);
  return ok(toDef(row));
}

export async function archiveDef(
  db: Db,
  id: string,
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(customFieldDefs)
    .set({ archivedAt: new Date() })
    .where(eq(customFieldDefs.id, id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.CF_DEF_NOT_FOUND, "custom-field def not found", { id }));
  }
  defsCache.invalidate(db);
  return ok(toDef(row));
}

// Renames a def. Only `name` is written: `key` is immutable because entity
// custom_fields jsonb stores values under it. `updatedAt` fires via $onUpdate.
export async function updateDefName(
  db: Db,
  input: { id: string; name: string },
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(customFieldDefs)
    .set({ name: input.name })
    .where(eq(customFieldDefs.id, input.id))
    .returning();
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.CF_DEF_NOT_FOUND, "custom-field def not found", { id: input.id }),
    );
  }
  defsCache.invalidate(db);
  return ok(toDef(row));
}

// Sets the important + show-in-add-form placement flags for a def. Both are written together
// (never independently) so the client always sends the full pair and a stale read of one flag
// can't clobber the other. Ungated: the metadata.manage check happens in the action layer.
export async function setDefFlags(
  db: Db,
  input: { id: string; isImportant: boolean; showInAddForm: boolean },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(customFieldDefs)
    .set({ isImportant: input.isImportant, showInAddForm: input.showInAddForm })
    .where(eq(customFieldDefs.id, input.id))
    .returning();
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.CF_DEF_NOT_FOUND, "custom-field def not found", { id: input.id }),
    );
  }
  defsCache.invalidate(db);
  return ok(undefined);
}

// Writes the order column to match the given id order, in a single transaction
// so the list never observes a half-applied reorder. Ids not present are no-ops.
export async function reorderDefs(
  db: Db,
  orderedIds: string[],
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id === undefined) continue;
      await tx.update(customFieldDefs).set({ order: i }).where(eq(customFieldDefs.id, id));
    }
  });
  defsCache.invalidate(db);
  return ok(true);
}
