import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { pipelines, stages } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedPipelineAndStage } from "./seed-smoke";
import { SMOKE_PIPELINE_NAME, SMOKE_STAGE_NAME } from "./seed-smoke-config";
import { type Db, makeDb, seedVisibilityGroups } from "./seed-smoke-phase5-infra";
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
  test("seedPipelineAndStage creates the smoke pipeline and stage and is idempotent", async () => {
    const first = await seedPipelineAndStage(db);
    const again = await seedPipelineAndStage(db);
    expect(again).toEqual(first);

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

  test("upsertPipeline is idempotent by name, with and without a visibility group", async () => {
    const { restrictedGroupId } = await seedVisibilityGroups(db);
    const open = await upsertPipeline(db, "Acme BD", null);
    const restricted = await upsertPipeline(db, "Restricted Pipeline", restrictedGroupId);
    expect(await upsertPipeline(db, "Acme BD", null)).toBe(open);
    expect(await upsertPipeline(db, "Restricted Pipeline", restrictedGroupId)).toBe(restricted);

    const rows = await h.db.select().from(pipelines);
    expect(rows.map((r) => r.name).sort()).toEqual(["Acme BD", "Restricted Pipeline"]);
    expect(rows.find((r) => r.id === restricted)?.visibilityGroupId).toBe(restrictedGroupId);
  });

  test("upsertPipeline picks the oldest pipeline when earlier runs left duplicates", async () => {
    const [newer] = await h.db
      .insert(pipelines)
      .values({ name: "Acme BD", createdAt: new Date("2026-02-01T00:00:00Z") })
      .returning();
    const [older] = await h.db
      .insert(pipelines)
      .values({ name: "Acme BD", createdAt: new Date("2026-01-01T00:00:00Z") })
      .returning();
    expect(newer?.id).not.toBe(older?.id);

    expect(await upsertPipeline(db, "Acme BD", null)).toBe(older?.id);
    expect(await h.db.select().from(pipelines)).toHaveLength(2);
  });
});
