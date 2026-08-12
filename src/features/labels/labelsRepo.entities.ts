import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { LabelTarget } from "@/constants/labelColors";
import type { Db } from "@/db/client";
import { type Label, labels } from "@/db/schema/system";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { labelJoin } from "./labelJoins";

// Batch-read the catalog labels applied to a set of entities of one target, keyed by entity id and
// ordered by the label's catalog order. Entities with no labels are absent from the map (callers
// default to []).
export async function labelsForEntities(
  db: Db,
  target: LabelTarget,
  entityIds: string[],
  signal: AbortSignal,
): Promise<Map<string, Label[]>> {
  signal.throwIfAborted();
  const out = new Map<string, Label[]>();
  if (entityIds.length === 0) return out;
  const j = labelJoin(target);
  const rows = await db
    .select({ entityId: j.entityCol, label: labels })
    .from(j.table)
    .innerJoin(labels, eq(j.labelCol, labels.id))
    .where(inArray(j.entityCol, entityIds))
    .orderBy(asc(labels.order));
  for (const row of rows) {
    const list = out.get(row.entityId as string) ?? [];
    list.push(row.label);
    out.set(row.entityId as string, list);
  }
  return out;
}

// Replace an entity's applied labels with exactly `labelIds`, transactionally: delete the links no
// longer present, insert the newly-added ones. A no-op set clears all links. Accepts a Db or an
// open transaction so callers can fold it into an existing write.
export async function setEntityLabels(
  db: DbOrTx,
  target: LabelTarget,
  entityId: string,
  labelIds: string[],
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const j = labelJoin(target);
  const run = async (tx: DbOrTx): Promise<void> => {
    const existing = await tx
      .select({ labelId: j.labelCol })
      .from(j.table)
      .where(eq(j.entityCol, entityId));
    const have = new Set(existing.map((r) => r.labelId as string));
    const want = new Set(labelIds);
    const toRemove = [...have].filter((id) => !want.has(id));
    const toAdd = labelIds.filter((id) => !have.has(id));
    if (toRemove.length > 0) {
      await tx.delete(j.table).where(and(eq(j.entityCol, entityId), inArray(j.labelCol, toRemove)));
    }
    if (toAdd.length > 0) {
      await tx
        .insert(j.table)
        .values(toAdd.map((labelId) => ({ [entityColName(target)]: entityId, labelId })));
    }
  };
  // If we were handed a plain Db, wrap in a transaction; if already a tx, run inline.
  if ("transaction" in db && typeof db.transaction === "function") {
    await (db as Db).transaction(run);
  } else {
    await run(db);
  }
}

// Name-based entry point for the write paths. Entities store applied labels as a name array, so
// every writer holds names, not catalog ids: this resolves them (case-insensitively, matching
// resolveLabelChips) and replaces the join rows in the same transaction as the array write.
//
// A name with no catalog row is ADOPTED into the catalog rather than rejected or dropped. That
// keeps the invariant every read path assumes, that an applied name always has a catalog entry, so
// it appears in Settings and in the pickers, and it never renders as an unresolvable gray chip.
// Rejecting instead would break lead-to-deal conversion, which carries lead label names onto a
// deal whose catalog may not have them yet.
export async function syncEntityLabelNames(
  db: DbOrTx,
  target: LabelTarget,
  entityId: string,
  names: string[],
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const run = async (tx: DbOrTx): Promise<void> => {
    const ids = await resolveOrAdoptNames(tx, target, names, signal);
    await setEntityLabels(tx, target, entityId, ids, signal);
  };
  if ("transaction" in db && typeof db.transaction === "function") {
    await (db as Db).transaction(run);
  } else {
    await run(db);
  }
}

async function resolveOrAdoptNames(
  tx: DbOrTx,
  target: LabelTarget,
  names: string[],
  signal: AbortSignal,
): Promise<string[]> {
  if (names.length === 0) return [];
  const catalog = await tx.select().from(labels).where(eq(labels.target, target));
  const byName = new Map(catalog.map((l) => [l.name.toLowerCase(), l.id]));
  const ids: string[] = [];
  let nextOrder = catalog.reduce((max, l) => Math.max(max, l.order + 1), 0);
  for (const name of names) {
    const existing = byName.get(name.toLowerCase());
    if (existing !== undefined) {
      ids.push(existing);
      continue;
    }
    signal.throwIfAborted();
    // Adopted labels get the neutral color the resolver already falls back to, so the chip's
    // appearance does not change the moment it becomes catalog-backed.
    const [row] = await tx
      .insert(labels)
      .values({ target, name, color: "gray", order: nextOrder })
      .onConflictDoNothing()
      .returning();
    nextOrder += 1;
    // A concurrent writer may have adopted the same name first; the unique index makes that a
    // no-op insert, so re-read to get the winner's id.
    const id = row?.id ?? (await findLabelIdByName(tx, target, name));
    if (id === undefined) continue;
    byName.set(name.toLowerCase(), id);
    ids.push(id);
  }
  return ids;
}

async function findLabelIdByName(
  tx: DbOrTx,
  target: LabelTarget,
  name: string,
): Promise<string | undefined> {
  const [row] = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.target, target), sql`lower(${labels.name}) = lower(${name})`));
  return row?.id;
}

function entityColName(target: LabelTarget): string {
  switch (target) {
    case "deal":
      return "dealId";
    case "person":
      return "personId";
    case "organization":
      return "orgId";
    case "lead":
      return "leadId";
  }
}
