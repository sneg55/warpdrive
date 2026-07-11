import { and, asc, eq, inArray } from "drizzle-orm";
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
