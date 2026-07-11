// Finder #4 (UI-wiring audit): logic-invariant tests over the pipeline board's filter builder.
//
// The bug class this guards: an option the builder OFFERS that can never return results
// ("offered-but-impossible", e.g. Status=Won on a board whose query hardcodes status='open'),
// and empty value dropdowns. For every field the builder offers we assert, against seeded data
// through the real getBoardColumns query path (no mocked DB), that a representative value returns
// > 0 cards. Adding a new offered field with no representative case fails loudly here, forcing the
// author to prove it is reachable before shipping it.
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
import { OFFERED_BOARD_FILTER_FIELDS } from "./boardFilterFields";
import { getBoardColumns } from "./dealRepo";

type AstField = (typeof FILTER_FIELDS)[number];
type Condition = FilterDefinition["conditions"][number];

// A representative condition, per offered field, known to match the seed below. Only the fields the
// board actually offers have an entry; a lookup miss throws, which is the regression guard: adding
// a field to OFFERED_BOARD_FILTER_FIELDS without seed coverage fails this test, forcing the author
// to prove the new option returns results against seeded data before offering it.
function representativeCondition(field: AstField, ownerId: string): Condition {
  const byField: Partial<Record<AstField, Condition>> = {
    title: { field: "title", op: "contains", value: "Alpha" },
    orgName: { field: "orgName", op: "contains", value: "Apex" },
    value: { field: "value", op: "gt", value: 0 },
    ownerId: { field: "ownerId", op: "eq", value: ownerId },
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
    // Guards empty operator dropdowns: an offered field with no valid operator would render an
    // op picker with nothing to choose.
    for (const f of OFFERED_BOARD_FILTER_FIELDS) {
      expect(FILTER_FIELDS).toContain(f.value);
      expect(OPS_BY_FIELD[f.value].length).toBeGreaterThan(0);
    }
  });

  it("does not offer status (impossible against the board's status='open' hardcode)", () => {
    expect(OFFERED_BOARD_FILTER_FIELDS.map((f) => f.value)).not.toContain("status");
  });

  it("never offers an owner value option with zero matching cards", () => {
    // The owner dropdown is derived from the board's own cards, so every option must match >= 1
    // card. This locks that property in: deriving owners from a broader source (all users) would
    // reintroduce empty options.
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
      // An org-linked deal so the orgName representative condition ("contains Apex") has a match.
      const [org] = await db
        .insert(organizations)
        .values({ name: "Apex Labs", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      const seeds = [
        { title: "Alpha renewal", value: 1000, orgId: org!.id },
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
          },
          new AbortController().signal,
        );
        if (r.ok === false) throw new Error("seed failed");
      }

      for (const f of OFFERED_BOARD_FILTER_FIELDS) {
        const cond = representativeCondition(f.value, u.id);
        const res = await getBoardColumns(
          db,
          visSession(u.id),
          p.pipeline.id,
          new AbortController().signal,
          { conditions: [cond] },
        );
        expect(
          res.cards.length,
          `offered field "${f.value}" returned 0 cards for representative value ${JSON.stringify(cond.value)}`,
        ).toBeGreaterThan(0);
      }
    });
  });

  it("proves why status is not offered: status=won returns 0 cards on the board", async () => {
    await withTestDb(async (db) => {
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
      // createDeal always inserts status='open'; force this one to 'won' to model a real board.
      await db.execute(sql`UPDATE deals SET status = 'won' WHERE id = ${r.value.id}`);

      const res = await getBoardColumns(
        db,
        visSession(u.id),
        p.pipeline.id,
        new AbortController().signal,
        { conditions: [{ field: "status", op: "eq", value: "won" }] },
      );
      expect(res.cards.length).toBe(0);
    });
  });
});
