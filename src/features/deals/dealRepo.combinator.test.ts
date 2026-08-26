// The combinator and the rotting narrowing only prove out against real Postgres: "or" widens the
// result set, and the whole point of the rotting flag is that it must NOT widen with it.
import { sql } from "drizzle-orm";
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

const TITLE_ACME: FilterDefinition["conditions"][number] = {
  field: "title",
  op: "contains",
  value: "acme",
};
const VALUE_BIG: FilterDefinition["conditions"][number] = { field: "value", op: "gt", value: 100 };

async function seedDeals(
  db: TestDb,
  rows: Array<{ title: string; value: number }>,
): Promise<{ userId: string; pipelineId: string; stageId: string; ids: Map<string, string> }> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
  const u = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  const stageId = p.stages[0]!.id;
  const ids = new Map<string, string>();
  for (const row of rows) {
    const r = await createDeal(
      db,
      createSession(u.id),
      { title: row.title, pipelineId: p.pipeline.id, stageId, value: row.value },
      sig(),
    );
    if (r.ok === false) throw new Error("seed failed");
    ids.set(row.title, r.value.id);
  }
  return { userId: u.id, pipelineId: p.pipeline.id, stageId, ids };
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

describe("getBoardColumns with a filter combinator", () => {
  const SEEDS = [
    { title: "Acme small", value: 10 },
    { title: "Acme big", value: 500 },
    { title: "Globex big", value: 500 },
  ];

  it("or returns the union of the two conditions", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId } = await seedDeals(db, SEEDS);
      expect(
        await titles(db, userId, pipelineId, {
          combinator: "or",
          conditions: [TITLE_ACME, VALUE_BIG],
        }),
      ).toEqual(["Acme big", "Acme small", "Globex big"]);
    });
  });

  it("and returns the intersection of the two conditions", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId } = await seedDeals(db, SEEDS);
      expect(
        await titles(db, userId, pipelineId, {
          combinator: "and",
          conditions: [TITLE_ACME, VALUE_BIG],
        }),
      ).toEqual(["Acme big"]);
    });
  });

  it("a definition with no combinator key still intersects", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId } = await seedDeals(db, SEEDS);
      expect(await titles(db, userId, pipelineId, { conditions: [TITLE_ACME, VALUE_BIG] })).toEqual(
        ["Acme big"],
      );
    });
  });
});

describe("getBoardColumns with or plus the rotting narrowing", () => {
  it("does not return a non-rotting deal that matches one condition", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId, stageId, ids } = await seedDeals(db, [
        { title: "Acme rotting", value: 10 },
        { title: "Globex big", value: 500 },
      ]);
      await db.execute(sql`UPDATE stages SET rotting_days = 14 WHERE id = ${stageId}`);
      await db.execute(
        sql`UPDATE deals SET stage_entered_at = now() - interval '30 days' WHERE id = ${ids.get("Acme rotting")}`,
      );

      // Both deals match a disjunct, but only the aged one is rotting. Folding rotting into the
      // OR would hand back "Globex big" as well.
      expect(
        await titles(db, userId, pipelineId, {
          combinator: "or",
          conditions: [TITLE_ACME, VALUE_BIG],
          rotting: true,
        }),
      ).toEqual(["Acme rotting"]);
    });
  });
});
