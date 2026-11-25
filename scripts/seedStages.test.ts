import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { pipelines, stages } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedPipelineAndStage } from "./seed-smoke";
import { SMOKE_PIPELINE_NAME, SMOKE_STAGE_NAME } from "./seed-smoke-config";
import { type Db, makeDb } from "./seed-smoke-phase5-infra";
import { upsertPipeline, upsertStage } from "./seed-smoke-phase5-records";

let h: TestDb;
let db: Db;

beforeAll(async () => {
  h = await makeTestDb();
  db = makeDb(h.pool);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.db.execute(sql`TRUNCATE stages, pipelines RESTART IDENTITY CASCADE`);
});

describe("seed scripts write stages without the dropped probability column", () => {
  test("seedPipelineAndStage creates the smoke pipeline and stage", async () => {
    const first = await seedPipelineAndStage(db);

    const pipelineRows = await h.db.select().from(pipelines);
    expect(pipelineRows).toHaveLength(1);
    expect(pipelineRows[0]!.name).toBe(SMOKE_PIPELINE_NAME);

    const stageRows = await h.db.select().from(stages);
    expect(stageRows).toHaveLength(1);
    expect(stageRows[0]!.name).toBe(SMOKE_STAGE_NAME);
    expect(stageRows[0]!.pipelineId).toBe(first.pipelineId);
  });

  test("upsertStage creates ordered stages and is idempotent by pipeline and name", async () => {
    const pipelineId = await upsertPipeline(db, "Acme BD", null);
    const lead = await upsertStage(db, pipelineId, "Lead", 0);
    const qualified = await upsertStage(db, pipelineId, "Qualified", 1);
    const leadAgain = await upsertStage(db, pipelineId, "Lead", 0);
    expect(leadAgain).toBe(lead);
    expect(qualified).not.toBe(lead);

    const rows = await h.db.select().from(stages);
    expect(rows.map((r) => [r.name, r.order]).sort()).toEqual([
      ["Lead", 0],
      ["Qualified", 1],
    ]);
  });
});
