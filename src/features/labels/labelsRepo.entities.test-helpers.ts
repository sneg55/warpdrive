import { asc, eq, inArray } from "drizzle-orm";
import type { LabelTarget } from "@/constants/labelColors";
import type { Db } from "@/db/client";
import { type Label, labels } from "@/db/schema/system";
import { labelJoin } from "./labelJoins";

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
