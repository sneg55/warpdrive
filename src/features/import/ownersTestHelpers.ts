import { eq } from "drizzle-orm";
import { importRows } from "@/db/schema";
import type { MappedRow } from "@/types/import";
import { commitRow, type ImportActor } from "./commit";
import { seedBatchWithRows, type TestDb } from "./pipedriveImport.testHelpers";
import type { ImportTarget } from "./wizardState";

export const OWNERS_RUN_TIMEOUT_MS = 20_000;

export async function run(db: TestDb, actor: ImportActor, target: ImportTarget, row: MappedRow) {
  const signal = AbortSignal.timeout(OWNERS_RUN_TIMEOUT_MS);
  const { rowIds } = await seedBatchWithRows(db, actor.id, {
    source: "pipedrive",
    target,
    rows: [row],
  });
  const rowId = rowIds[0] ?? "";
  const outcome = await commitRow(db, actor, rowId, target, "skip", signal);
  const [stored] = await db.select().from(importRows).where(eq(importRows.id, rowId));
  return { outcome, warnings: stored?.warnings ?? [] };
}

export const dealPrimary = (pipeline: string, extra: Record<string, unknown>) => ({
  title: "Deal",
  value: 10,
  expectedCloseDate: null,
  pipeline,
  stage: null,
  customFields: {},
  ...extra,
});
