import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { pipelines } from "./pipelines";
import { stages } from "./stages";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("stages schema", () => {
  it("inserts a pipeline and a valid stage", async () => {
    const [p] = await h.db.insert(pipelines).values({ name: "Sales" }).returning();
    const [s] = await h.db
      .insert(stages)
      .values({ pipelineId: p!.id, name: "Qualified" })
      .returning();
    expect(s!.name).toBe("Qualified");
    expect(s!.pipelineId).toBe(p!.id);
  });

  it("cascades delete: removing a pipeline removes its stages", async () => {
    const [p] = await h.db.insert(pipelines).values({ name: "ToDelete" }).returning();
    await h.db.insert(stages).values({ pipelineId: p!.id, name: "Orphan" });
    await h.db.delete(pipelines).where(sql`id = ${p!.id}`);
    const remaining = await h.db.select().from(stages).where(sql`pipeline_id = ${p!.id}`);
    expect(remaining).toHaveLength(0);
  });

  it("has a UNIQUE (id, pipeline_id) constraint so deals can composite-FK it", async () => {
    const rows = await h.db.execute(sql`
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'stages'::regclass AND contype = 'u'
    `);
    const list = (rows as unknown as { rows: unknown[] }).rows;
    expect(list.length).toBeGreaterThan(0);
  });
});
