import { asc, eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { LabelColor, LabelTarget } from "@/constants/labelColors";
import type { Db } from "@/db/client";
import { type Label, labels } from "@/db/schema/system";
import { err, ok, type Result } from "@/types/result";
import { labelArraySource, labelJoin } from "./labelJoins";

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

export async function listAppliedLabelNames(
  db: Db,
  target: LabelTarget,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const src = labelArraySource(target);
  const rows = await db
    .selectDistinct({ name: sql<string>`applied` })
    .from(sql`${src.table}, unnest(${src.labelsCol}) as applied`);
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
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
  return await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ target: labels.target, name: labels.name })
      .from(labels)
      .where(eq(labels.id, input.id));
    if (before === undefined) {
      return err(new AppError(ERROR_IDS.LABEL_NOT_FOUND, "label not found", input));
    }
    const [row] = await tx
      .update(labels)
      .set({ name: input.name })
      .where(eq(labels.id, input.id))
      .returning();
    if (row === undefined) {
      return err(new AppError(ERROR_IDS.LABEL_NOT_FOUND, "label not found", input));
    }
    const src = labelArraySource(before.target);
    await tx
      .update(src.table)
      .set({
        labels: sql`(select coalesce(array_agg(case when lower(applied) = lower(${before.name}) then ${input.name} else applied end order by ord), '{}') from unnest(${src.labelsCol}) with ordinality as t(applied, ord))`,
      })
      .where(
        sql`exists (select 1 from unnest(${src.labelsCol}) as applied where lower(applied) = lower(${before.name}))`,
      );
    return ok(row);
  });
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

async function countLabelUsage(
  db: Db,
  label: { id: string; target: LabelTarget; name: string },
): Promise<number> {
  const src = labelArraySource(label.target);
  const [arrayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(src.table)
    .where(
      sql`exists (select 1 from unnest(${src.labelsCol}) as applied where lower(applied) = lower(${label.name}))`,
    );
  const j = labelJoin(label.target);
  const [joinRow] = await db
    .select({ n: sql<number>`count(distinct ${j.entityCol})::int` })
    .from(j.table)
    .where(eq(j.labelCol, label.id));
  return Math.max(arrayRow?.n ?? 0, joinRow?.n ?? 0);
}

export async function deleteLabel(
  db: Db,
  input: { id: string },
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  signal.throwIfAborted();
  const [existing] = await db
    .select({ id: labels.id, target: labels.target, name: labels.name })
    .from(labels)
    .where(eq(labels.id, input.id));
  if (existing === undefined) {
    return err(new AppError(ERROR_IDS.LABEL_NOT_FOUND, "label not found", input));
  }
  const usage = await countLabelUsage(db, existing);
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
