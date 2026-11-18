import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizations } from "@/db/schema";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "@/features/deals/dealActions";
import { createSession, visSession } from "@/features/saved-filters/filterAst.test-helpers";
import {
  FILTER_FIELDS,
  type FilterDefinition,
  OPS_BY_FIELD,
} from "@/features/saved-filters/schemas";
import { distinctBoardOwners, matchesOwnerFilter } from "./boardFilter";
import { dealFilterFields } from "./dealFilterCatalog";
import { getBoardColumns } from "./dealRepo";

type AstField = (typeof FILTER_FIELDS)[number];
type Condition = FilterDefinition["conditions"][number];

const SEED_CLOSE_DATE = "2026-09-30";
const SEED_LABEL = "Hot";

interface SeedRefs {
  ownerId: string;
  stageId: string;
}

function representativeCondition(field: AstField, seed: SeedRefs): Condition {
  const byField: Partial<Record<AstField, Condition>> = {
    title: { field: "title", op: "contains", value: "Alpha" },
    orgName: { field: "orgName", op: "contains", value: "Apex" },
    value: { field: "value", op: "gt", value: 0 },
    ownerId: { field: "ownerId", op: "eq", value: seed.ownerId },
    stageId: { field: "stageId", op: "eq", value: seed.stageId },
    status: { field: "status", op: "eq", value: "open" },
    expectedCloseDate: { field: "expectedCloseDate", op: "gte", value: SEED_CLOSE_DATE },
    nextActivityAt: { field: "nextActivityAt", op: "isEmpty" },
    lastActivityAt: { field: "lastActivityAt", op: "isEmpty" },
    wonTime: { field: "wonTime", op: "isEmpty" },
    labels: { field: "labels", op: "eq", value: SEED_LABEL },
  };
  const cond = byField[field];
  if (cond === undefined) {
    throw new Error(
      `No representative value for offered board filter field "${field}". Add seed coverage in boardFilterInvariants.test.ts before offering it.`,
    );
  }
  return cond;
}

describe("board filter builder invariants (finder #4)", () => {
  it("offers only fields the schema allows, each with at least one operator", () => {
    for (const f of dealFilterFields()) {
      expect(FILTER_FIELDS).toContain(f.field);
      expect(OPS_BY_FIELD[f.field].length).toBeGreaterThan(0);
    }
  });

  it("offers status now that a status condition replaces the board's open gate", () => {
    expect(dealFilterFields().map((f) => f.field)).toContain("status");
  });

  it("never offers an owner value option with zero matching cards", () => {
    const cards = [
      { ownerId: "u1", ownerName: "Alice" },
      { ownerId: "u2", ownerName: "Bob" },
      { ownerId: "u1", ownerName: "Alice" },
    ];
    for (const owner of distinctBoardOwners(cards)) {
      const matches = cards.filter((c) => matchesOwnerFilter(c, owner.ownerId));
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("returns > 0 board cards for a representative value of every offered field", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Apex Labs", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      const seeds = [
        {
          title: "Alpha renewal",
          value: 1000,
          orgId: org!.id,
          closeDate: SEED_CLOSE_DATE,
          labels: [SEED_LABEL],
        },
        { title: "Beta expansion", value: 5000 },
        { title: "Gamma upsell", value: 250 },
      ];
      for (const s of seeds) {
        const r = await createDeal(
          db,
          createSession(u.id),
          {
            title: s.title,
            value: s.value,
            pipelineId: p.pipeline.id,
            stageId: p.stages[0]!.id,
            orgId: s.orgId ?? null,
            expectedCloseDate: s.closeDate ?? null,
            labels: s.labels ?? [],
          },
          new AbortController().signal,
        );
        if (r.ok === false) throw new Error("seed failed");
      }

      for (const f of dealFilterFields()) {
        const cond = representativeCondition(f.field, { ownerId: u.id, stageId: p.stages[0]!.id });
        const res = await getBoardColumns(
          db,
          visSession(u.id),
          p.pipeline.id,
          new AbortController().signal,
          { conditions: [cond] },
        );
        expect(
          res.cards.length,
          `offered field "${f.field}" returned 0 cards for representative value ${JSON.stringify(cond.value)}`,
        ).toBeGreaterThan(0);
      }
    });
  });

  async function seedOneWonDeal(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
    await db.insert(settings).values({
      id: true,
      baseCurrency: "USD",
      defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
    });
    const u = await seedUser(db);
    const p = await seedPipelineWithStages(db, ["A"]);
    const r = await createDeal(
      db,
      createSession(u.id),
      { title: "Won deal", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
      new AbortController().signal,
    );
    if (r.ok === false) throw new Error("seed failed");
    await db.execute(sql`UPDATE deals SET status = 'won' WHERE id = ${r.value.id}`);
    return { userId: u.id, pipelineId: p.pipeline.id };
  }

  it("status=won returns the won card on the board, carrying its status", async () => {
    await withTestDb(async (db) => {
      const seed = await seedOneWonDeal(db);
      const res = await getBoardColumns(
        db,
        visSession(seed.userId),
        seed.pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "status", op: "eq", value: "won" }] },
      );
      expect(res.cards.map((c) => c.status)).toEqual(["won"]);
    });
  });

  it("a filter without a status condition still hides won deals from the board", async () => {
    await withTestDb(async (db) => {
      const seed = await seedOneWonDeal(db);
      const res = await getBoardColumns(
        db,
        visSession(seed.userId),
        seed.pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "title", op: "contains", value: "Won" }] },
      );
      expect(res.cards).toHaveLength(0);
    });
  });
});
