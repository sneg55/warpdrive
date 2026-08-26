import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizations } from "@/db/schema";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "@/features/deals/dealActions";
import { createSession, visSession } from "@/features/saved-filters/filterAst.test-helpers";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { getBoardColumns } from "./dealRepo";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
type Condition = FilterDefinition["conditions"][number];

describe("getBoardColumns with a FilterDefinition", () => {
  it("narrows to titles matching a contains filter, still visibility-safe", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      for (const t of ["Acme renewal", "Globex expansion", "acme upsell"]) {
        const r = await createDeal(
          db,
          createSession(u.id),
          { title: t, pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
          new AbortController().signal,
        );
        if (r.ok === false) throw new Error("seed failed");
      }

      const all = await getBoardColumns(
        db,
        visSession(u.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      expect(all.cards).toHaveLength(3);

      const filtered = await getBoardColumns(
        db,
        visSession(u.id),
        p.pipeline.id,
        new AbortController().signal,
        { conditions: [{ field: "title", op: "contains", value: "acme" }] },
      );
      expect(filtered.cards.map((c) => c.title).sort()).toEqual(["Acme renewal", "acme upsell"]);
    });
  });
});

// deals.labels is text[] of label names, so a labels condition compiles to a case-insensitive
// membership test, not a scalar comparison. Real Postgres is the only thing that proves the
// operator and the empty-array case behave, which is why this runs against the DB, not a mock.
describe("getBoardColumns with a labels condition", () => {
  async function seedLabelledDeals(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
    await db.insert(settings).values({
      id: true,
      baseCurrency: "USD",
      defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
    });
    const u = await seedUser(db);
    const p = await seedPipelineWithStages(db, ["A"]);
    const seeds: Array<[string, string[]]> = [
      ["hot-deal", ["hot"]],
      ["cold-deal", ["cold"]],
      ["unlabelled-deal", []],
    ];
    for (const [title, labels] of seeds) {
      const r = await createDeal(
        db,
        createSession(u.id),
        { title, pipelineId: p.pipeline.id, stageId: p.stages[0]!.id, labels },
        new AbortController().signal,
      );
      if (r.ok === false) throw new Error("seed failed");
    }
    return { u, pipelineId: p.pipeline.id };
  }

  it("eq matches only deals carrying that label, empty-labelled deals included in neq", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedLabelledDeals(db);

      const hot = await getBoardColumns(
        db,
        visSession(u.id),
        pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "labels", op: "eq", value: "hot" }] },
      );
      expect(hot.cards.map((c) => c.title)).toEqual(["hot-deal"]);

      const notHot = await getBoardColumns(
        db,
        visSession(u.id),
        pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "labels", op: "neq", value: "hot" }] },
      );
      expect(notHot.cards.map((c) => c.title).sort()).toEqual(["cold-deal", "unlabelled-deal"]);
    });
  });

  // A migrated install can still hold legacy lowercase values in deals.labels while the picker
  // offers the catalog's cased name, so matching has to ignore case on both sides.
  it("matches a legacy lowercase label value against the cased name the picker offers", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedLabelledDeals(db);

      const hot = await getBoardColumns(
        db,
        visSession(u.id),
        pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "labels", op: "eq", value: "Hot" }] },
      );
      expect(hot.cards.map((c) => c.title)).toEqual(["hot-deal"]);

      const notHot = await getBoardColumns(
        db,
        visSession(u.id),
        pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "labels", op: "neq", value: "Hot" }] },
      );
      expect(notHot.cards.map((c) => c.title).sort()).toEqual(["cold-deal", "unlabelled-deal"]);
    });
  });

  it("SECURITY: an injection payload in a labels value is a bound literal, not SQL", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedLabelledDeals(db);
      const res = await getBoardColumns(
        db,
        visSession(u.id),
        pipelineId,
        new AbortController().signal,
        { conditions: [{ field: "labels", op: "eq", value: "'); DROP TABLE deals; --" }] },
      );
      expect(res.cards).toHaveLength(0);
      const still = await getBoardColumns(
        db,
        visSession(u.id),
        pipelineId,
        new AbortController().signal,
      );
      expect(still.cards).toHaveLength(3);
    });
  });
});

// Null semantics are the one thing a mocked query cannot get right: `NULL <> 5` and
// `NULL NOT ILIKE 'x'` are both NULL, so the row silently disappears from the result rather than
// failing loudly. Every assertion here runs against real Postgres for that reason.
describe("getBoardColumns null semantics on the Tier 2 operators", () => {
  async function seedNullShapes(db: TestDb) {
    await db.insert(settings).values({
      id: true,
      baseCurrency: "USD",
      defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
    });
    const u = await seedUser(db);
    const p = await seedPipelineWithStages(db, ["A"]);
    const [org] = await db
      .insert(organizations)
      .values({ name: "Acme Inc", ownerId: u.id, visibilityLevel: "all" })
      .returning();
    const seeds: Array<{ title: string; value: number | null; orgId: string | null; l: string[] }> =
      [
        { title: "Alpha", value: 100, orgId: org?.id ?? null, l: ["hot"] },
        { title: "Beta", value: null, orgId: null, l: [] },
        { title: "Gamma", value: 50, orgId: null, l: ["cold"] },
      ];
    let gammaId = "";
    for (const s of seeds) {
      const r = await createDeal(
        db,
        createSession(u.id),
        {
          title: s.title,
          pipelineId: p.pipeline.id,
          stageId: p.stages[0]!.id,
          value: s.value,
          orgId: s.orgId,
          labels: s.l,
        },
        new AbortController().signal,
      );
      if (r.ok === false) throw new Error("seed failed");
      if (s.title === "Gamma") gammaId = r.value.id;
    }
    // createDeal requires a non-empty title, so blank one directly: an empty title is a state an
    // import can leave behind and is exactly what `title isEmpty` exists to find.
    await db.execute(sql`UPDATE deals SET title = '' WHERE id = ${gammaId}`);
    return { u, pipelineId: p.pipeline.id };
  }

  async function matching(db: TestDb, u: { id: string }, pipelineId: string, c: Condition) {
    const res = await getBoardColumns(
      db,
      visSession(u.id),
      pipelineId,
      new AbortController().signal,
      { conditions: [c] },
    );
    return res.cards.map((card) => card.title).sort();
  }

  it("value neq keeps a deal with no value (IS DISTINCT FROM, not <>)", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedNullShapes(db);
      const titles = await matching(db, u, pipelineId, { field: "value", op: "neq", value: 5 });
      expect(titles).toContain("Beta");
      expect(titles).toEqual(["", "Alpha", "Beta"]);
    });
  });

  it("orgName notContains keeps a deal with no linked organization", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedNullShapes(db);
      const titles = await matching(db, u, pipelineId, {
        field: "orgName",
        op: "notContains",
        value: "acme",
      });
      expect(titles).toEqual(["", "Beta"]);
    });
  });

  it("title isEmpty matches the blank title and nothing else", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedNullShapes(db);
      expect(await matching(db, u, pipelineId, { field: "title", op: "isEmpty" })).toEqual([""]);
      expect(await matching(db, u, pipelineId, { field: "title", op: "isNotEmpty" })).toEqual([
        "Alpha",
        "Beta",
      ]);
    });
  });

  it("value isEmpty matches only the deal with no value", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedNullShapes(db);
      expect(await matching(db, u, pipelineId, { field: "value", op: "isEmpty" })).toEqual([
        "Beta",
      ]);
    });
  });

  it("labels isEmpty matches only the deal with an empty labels array", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedNullShapes(db);
      expect(await matching(db, u, pipelineId, { field: "labels", op: "isEmpty" })).toEqual([
        "Beta",
      ]);
      expect(await matching(db, u, pipelineId, { field: "labels", op: "isNotEmpty" })).toEqual([
        "",
        "Alpha",
      ]);
    });
  });

  it("title startsWith anchors at the start of the title", async () => {
    await withTestDb(async (db) => {
      const { u, pipelineId } = await seedNullShapes(db);
      expect(
        await matching(db, u, pipelineId, { field: "title", op: "startsWith", value: "Al" }),
      ).toEqual(["Alpha"]);
    });
  });
});
