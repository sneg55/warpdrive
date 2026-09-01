import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { importBatches, importRows } from "@/db/schema";
import type { withTestDb } from "@/db/testing";
import type { MappedRow } from "@/types/import";
import type { ImportActor } from "./commit";

export function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

export async function seedValidRow(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  mapped: MappedRow,
): Promise<{ id: string }> {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: "lead", filename: "l.csv", createdBy: userId })
    .returning();
  if (batch === undefined) {
    throw new AppError(ERROR_IDS.DB_INVARIANT, "batch seed failed", {});
  }
  const [row] = await db
    .insert(importRows)
    .values({ batchId: batch.id, rowNumber: 1, raw: {}, mapped, status: "valid" })
    .returning();
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INVARIANT, "row seed failed", {});
  }
  return row;
}
