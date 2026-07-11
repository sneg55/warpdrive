// Shared setup helpers for dealUpdate.test.ts and dealUpdatePerms.test.ts.
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";
import { createSession, seedSettings } from "./dealMove.test-helpers";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

export async function setupDeal(db: Db) {
  await seedSettings(db);
  const u = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  const stage = p.stages[0];
  if (stage === undefined) throw new AppError(ERROR_IDS.DB_INVARIANT, "setup: missing stage");
  const created = await createDeal(
    db,
    createSession(u.id),
    { title: "Initial", pipelineId: p.pipeline.id, stageId: stage.id },
    new AbortController().signal,
  );
  if (created.ok === false)
    throw new AppError(ERROR_IDS.DB_INVARIANT, `createDeal failed: ${created.error.message}`);
  return { u, deal: created.value, p };
}
