// A multi-value labels condition binds the names as one text[] parameter. Whether Postgres accepts
// that cast, and whether the case-insensitive comparison survives it, is only answerable against a
// real server, so every assertion here runs the compiled statement.
import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "@/features/deals/dealActions";
import { createSession, visSession } from "@/features/saved-filters/filterAst.test-helpers";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { getBoardColumns } from "./dealRepo";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const sig = () => new AbortController().signal;

async function seedLabelled(db: TestDb): Promise<{ userId: string; pipelineId: string }> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
  const u = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  // "hot" is stored lowercase the way 0046_label_backfill leaves a legacy value; the picker offers
  // the cased catalog name.
  const seeds: Array<[string, string[]]> = [
    ["hot-deal", ["hot"]],
    ["warm-deal", ["Warm"]],
    ["cold-deal", ["Cold"]],
    ["unlabelled-deal", []],
  ];
  for (const [title, labels] of seeds) {
    const r = await createDeal(
      db,
      createSession(u.id),
      { title, pipelineId: p.pipeline.id, stageId: p.stages[0]!.id, labels },
      sig(),
    );
    if (r.ok === false) throw new Error("seed failed");
  }
  return { userId: u.id, pipelineId: p.pipeline.id };
}

async function titles(
  db: TestDb,
  userId: string,
  pipelineId: string,
  def: FilterDefinition,
): Promise<string[]> {
  const res = await getBoardColumns(db, visSession(userId), pipelineId, sig(), def);
  return res.cards.map((c) => c.title).sort();
}

describe("getBoardColumns with a multi-value labels condition", () => {
  it("eq matches a deal carrying either name, legacy lowercase included", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId } = await seedLabelled(db);
      expect(
        await titles(db, userId, pipelineId, {
          conditions: [{ field: "labels", op: "eq", value: ["Hot", "Warm"] }],
        }),
      ).toEqual(["hot-deal", "warm-deal"]);
    });
  });

  it("neq excludes a deal carrying any of the names and keeps the unlabelled one", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId } = await seedLabelled(db);
      expect(
        await titles(db, userId, pipelineId, {
          conditions: [{ field: "labels", op: "neq", value: ["Hot", "Warm"] }],
        }),
      ).toEqual(["cold-deal", "unlabelled-deal"]);
    });
  });

  it("SECURITY: an injection payload inside the list matches nothing and leaves the table", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId } = await seedLabelled(db);
      expect(
        await titles(db, userId, pipelineId, {
          conditions: [{ field: "labels", op: "eq", value: ["'); DROP TABLE deals; --"] }],
        }),
      ).toEqual([]);
      expect(await titles(db, userId, pipelineId, { conditions: [] })).toHaveLength(4);
    });
  });
});
