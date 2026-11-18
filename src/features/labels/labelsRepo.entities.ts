import { and, eq, inArray, sql } from "drizzle-orm";
import type { LabelTarget } from "@/constants/labelColors";
import type { Db } from "@/db/client";
import { labels } from "@/db/schema/system";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { labelJoin } from "./labelJoins";

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
  if ("transaction" in db && typeof db.transaction === "function") {
    await (db as Db).transaction(run);
  } else {
    await run(db);
  }
}

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
    const [row] = await tx
      .insert(labels)
      .values({ target, name, color: "gray", order: nextOrder })
      .onConflictDoNothing()
      .returning();
    nextOrder += 1;
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
