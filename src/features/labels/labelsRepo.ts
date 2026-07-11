import { asc, eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { LabelColor, LabelTarget } from "@/constants/labelColors";
import type { Db } from "@/db/client";
import { type Label, labels } from "@/db/schema/system";
import { err, ok, type Result } from "@/types/result";
import { ALL_LABEL_JOINS } from "./labelJoins";

// Label catalog CRUD (settings spec 6.4). Labels are per target (deal|person|organization) and
// are applied to records through the deal_labels/person_labels/org_labels join tables, so delete
// is guarded: a label still applied to any record is blocked (surface the count).

export async function listLabels(
  db: Db,
  opts: { target?: LabelTarget },
  signal: AbortSignal,
): Promise<Label[]> {
  signal.throwIfAborted();
  const base = db.select().from(labels);
  const rows =
    opts.target === undefined
      ? await base.orderBy(asc(labels.target), asc(labels.order))
      : await base.where(eq(labels.target, opts.target)).orderBy(asc(labels.order));
  return rows;
}

export async function createLabel(
  db: Db,
  input: { target: LabelTarget; name: string; color: LabelColor },
  signal: AbortSignal,
): Promise<Result<Label, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .insert(labels)
    .values({ target: input.target, name: input.name, color: input.color })
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
  }
  return ok(row);
}

export async function renameLabel(
  db: Db,
  input: { id: string; name: string },
  signal: AbortSignal,
): Promise<Result<Label, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(labels)
    .set({ name: input.name })
    .where(eq(labels.id, input.id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.LABEL_NOT_FOUND, "label not found", input));
  }
  return ok(row);
}

export async function setLabelColor(
  db: Db,
  input: { id: string; color: LabelColor },
  signal: AbortSignal,
): Promise<Result<Label, AppError>> {
  signal.throwIfAborted();
  const [row] = await db
    .update(labels)
    .set({ color: input.color })
    .where(eq(labels.id, input.id))
    .returning();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.LABEL_NOT_FOUND, "label not found", input));
  }
  return ok(row);
}

export async function reorderLabels(
  db: Db,
  orderedIds: string[],
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id === undefined) continue;
      await tx.update(labels).set({ order: i }).where(eq(labels.id, id));
    }
  });
  return ok(true);
}

async function countLabelUsage(db: Db, labelId: string): Promise<number> {
  let total = 0;
  for (const j of ALL_LABEL_JOINS) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(j.table)
      .where(eq(j.labelCol, labelId));
    total += row?.n ?? 0;
  }
  return total;
}

export async function deleteLabel(
  db: Db,
  input: { id: string },
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  const [existing] = await db.select({ id: labels.id }).from(labels).where(eq(labels.id, input.id));
  if (existing === undefined) {
    return err(new AppError(ERROR_IDS.LABEL_NOT_FOUND, "label not found", input));
  }
  const usage = await countLabelUsage(db, input.id);
  if (usage > 0) {
    return err(
      new AppError(ERROR_IDS.LABEL_IN_USE, "label is applied to records", {
        id: input.id,
        count: usage,
      }),
    );
  }
  signal.throwIfAborted();
  await db.delete(labels).where(eq(labels.id, input.id));
  return ok(true);
}
