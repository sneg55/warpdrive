// filterAst.test.ts: functional + security tests for filterToSql
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal, updateDeal } from "@/features/deals/dealActions";
import { dealVisibilityClause } from "@/features/deals/visibility";
import { filterToSql } from "./filterAst";
import {
  adminPermSession,
  createSession,
  regularVisSession,
  visSession,
} from "./filterAst.test-helpers";

describe("filterToSql: functional", () => {
  it("filters deals by status eq 'open'", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const open = await createDeal(
        db,
        createSession(u.id),
        { title: "open", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
        new AbortController().signal,
      );
      const won = await createDeal(
        db,
        createSession(u.id),
        { title: "won", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
        new AbortController().signal,
      );
      if (open.ok === false || won.ok === false) throw new Error("setup");
      await updateDeal(
        db,
        adminPermSession(u.id),
        {
          dealId: won.value.id,
          expectedUpdatedAt: won.value.updatedAt.toISOString(),
          status: "won",
        },
        new AbortController().signal,
      );
      const frag = filterToSql({ conditions: [{ field: "status", op: "eq", value: "open" }] });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
        WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
      `);
      const titles = (res as unknown as { rows: Array<{ title: string }> }).rows.map(
        (r) => r.title,
      );
      expect(titles).toEqual(["open"]);
    });
  });

  it("filters deals by value gt threshold (narrows only)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const small = await createDeal(
        db,
        createSession(u.id),
        { title: "small", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id, value: 100 },
        new AbortController().signal,
      );
      const big = await createDeal(
        db,
        createSession(u.id),
        { title: "big", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id, value: 5000 },
        new AbortController().signal,
      );
      if (small.ok === false || big.ok === false) throw new Error("setup");
      const frag = filterToSql({ conditions: [{ field: "value", op: "gt", value: 1000 }] });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
        WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
      `);
      const titles = (res as unknown as { rows: Array<{ title: string }> }).rows.map(
        (r) => r.title,
      );
      expect(titles).toEqual(["big"]);
    });
  });

  it("SECURITY: filter with empty conditions never widens visibility", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "owner", person: "all", organization: "all" },
      });
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const d = await createDeal(
        db,
        createSession(owner.id),
        { title: "private", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
        new AbortController().signal,
      );
      if (d.ok === false) throw new Error("setup");
      const frag = filterToSql({ conditions: [] });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
        WHERE ${dealVisibilityClause(regularVisSession(other.id))} AND ${frag}
      `);
      const rows = (res as unknown as { rows: Array<{ title: string }> }).rows;
      expect(rows).toHaveLength(0);
    });
  });

  // SECURITY: injection payload on a numeric field is parameterized, rejected by
  // Postgres as a type error (not executed as SQL). Deals table must survive intact.
  it("SECURITY: injection payload in value is bound as a parameter, not executed", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const d = await createDeal(
        db,
        createSession(u.id),
        { title: "innocent", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
        new AbortController().signal,
      );
      if (d.ok === false) throw new Error("setup");

      // The injection payload is sent as $1 (parameterized). Postgres rejects it as
      // a non-numeric type for the `value` column, proving it never ran as SQL.
      // If it were interpolated, the semicolon would split the statement and
      // DROP TABLE deals would execute.
      const frag = filterToSql({
        conditions: [{ field: "value", op: "eq", value: "'; DROP TABLE deals; --" }],
      });
      await expect(
        db.execute(sql`
          SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
          WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
        `),
      ).rejects.toThrow();

      // Deals table is intact.
      const count = await db.execute(sql`SELECT COUNT(*) AS n FROM deals`);
      const n = Number((count as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0);
      expect(n).toBeGreaterThan(0);
    });
  });

  it("rotting flag keeps only deals past their stage's rotting_days threshold", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stageId = p.stages[0]!.id;
      // Stage rots after 14 days.
      await db.execute(sql`UPDATE stages SET rotting_days = 14 WHERE id = ${stageId}`);
      const rotting = await createDeal(
        db,
        createSession(u.id),
        { title: "rotting", pipelineId: p.pipeline.id, stageId },
        new AbortController().signal,
      );
      const fresh = await createDeal(
        db,
        createSession(u.id),
        { title: "fresh", pipelineId: p.pipeline.id, stageId },
        new AbortController().signal,
      );
      if (rotting.ok === false || fresh.ok === false) throw new Error("setup");
      // Age the rotting deal to 30 days in stage; fresh stays at now().
      await db.execute(
        sql`UPDATE deals SET stage_entered_at = now() - interval '30 days' WHERE id = ${rotting.value.id}`,
      );

      const frag = filterToSql({ conditions: [], rotting: true });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d
        JOIN pipelines p ON p.id = d.pipeline_id
        LEFT JOIN stages s ON s.id = d.stage_id
        WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
      `);
      const titles = (res as unknown as { rows: Array<{ title: string }> }).rows.map(
        (r) => r.title,
      );
      expect(titles).toEqual(["rotting"]);
    });
  });

  it("SECURITY: rejects an unknown field", () => {
    expect(() =>
      // @ts-expect-error intentional bad input for security test
      filterToSql({ conditions: [{ field: "secret", op: "eq", value: "x" }] }),
    ).toThrow();
  });

  it("SECURITY: rejects an unknown operator", () => {
    expect(() =>
      // @ts-expect-error intentional bad input for security test
      filterToSql({ conditions: [{ field: "status", op: "INJECT", value: "open" }] }),
    ).toThrow();
  });
});

describe("filterToSql: title + contains", () => {
  async function seedTitles(db: Parameters<Parameters<typeof withTestDb>[0]>[0], titles: string[]) {
    await db.insert(settings).values({
      id: true,
      baseCurrency: "USD",
      defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
    });
    const u = await seedUser(db);
    const p = await seedPipelineWithStages(db, ["A"]);
    for (const t of titles) {
      const r = await createDeal(
        db,
        createSession(u.id),
        { title: t, pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
        new AbortController().signal,
      );
      if (r.ok === false) throw new Error("seed deal failed");
    }
    return u;
  }

  it("title contains matches case-insensitively (ILIKE)", async () => {
    await withTestDb(async (db) => {
      const u = await seedTitles(db, ["Acme renewal", "Globex", "acme expansion"]);
      const frag = filterToSql({ conditions: [{ field: "title", op: "contains", value: "acme" }] });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
        WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
      `);
      const titles = (res as unknown as { rows: Array<{ title: string }> }).rows
        .map((r) => r.title)
        .sort();
      expect(titles).toEqual(["Acme renewal", "acme expansion"]);
    });
  });

  it("SECURITY: an injection payload in a contains value is a bound literal, not SQL", async () => {
    await withTestDb(async (db) => {
      const u = await seedTitles(db, ["safe deal"]);
      // If the value were interpolated this would break out of the string or drop the table.
      const frag = filterToSql({
        conditions: [{ field: "title", op: "contains", value: "'); DROP TABLE deals; --" }],
      });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
        WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
      `);
      // Payload is treated as a literal search string, matches nothing, and the table survives.
      expect((res as unknown as { rows: unknown[] }).rows).toHaveLength(0);
      const still = await db.execute(sql`SELECT count(*)::int AS n FROM deals`);
      expect((still as unknown as { rows: Array<{ n: number }> }).rows[0]?.n).toBe(1);
    });
  });
});
