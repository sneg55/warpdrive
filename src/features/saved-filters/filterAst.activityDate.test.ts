import { type SQL, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DATE_PRESET_KEYS } from "@/constants/dateFilterPresets";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "@/features/deals/dealActions";
import { dealVisibilityClause } from "@/features/deals/visibility";
import { filterToSql } from "./filterAst";
import { createSession, visSession } from "./filterAst.test-helpers";
import type { FilterDefinition } from "./schemas";

type Condition = FilterDefinition["conditions"][number];

async function seedDeal(
  db: Db,
  userId: string,
  pipelineId: string,
  stageId: string,
  title: string,
  next: SQL,
  last: SQL,
): Promise<void> {
  const r = await createDeal(
    db,
    createSession(userId),
    { title, pipelineId, stageId },
    new AbortController().signal,
  );
  if (!r.ok) throw new Error("setup");
  await db.execute(
    sql`UPDATE deals SET next_activity_at = ${next}, last_activity_at = ${last} WHERE id = ${r.value.id}`,
  );
}

async function titlesMatching(
  db: Db,
  userId: string,
  c: Condition,
  timeZone = "UTC",
): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT d.title FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
    WHERE ${dealVisibilityClause(visSession(userId))} AND ${filterToSql({ conditions: [c] }, { timeZone })}
    ORDER BY d.title
  `);
  return (res as unknown as { rows: Array<{ title: string }> }).rows.map((r) => r.title);
}

async function dbToday(db: Db): Promise<string> {
  const res = await db.execute(sql`SELECT (now() AT TIME ZONE 'UTC')::date::text AS today`);
  return (res as unknown as { rows: Array<{ today: string }> }).rows[0]?.today ?? "";
}

async function seedThree(db: Db): Promise<string> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
  const u = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  const stageId = p.stages[0]?.id ?? "";
  const pid = p.pipeline.id;
  await seedDeal(db, u.id, pid, stageId, "due-today", sql`now()`, sql`now() - interval '10 days'`);
  await seedDeal(
    db,
    u.id,
    pid,
    stageId,
    "due-in-3-days",
    sql`now() + interval '3 days'`,
    sql`now() - interval '40 days'`,
  );
  await seedDeal(db, u.id, pid, stageId, "no-activity", sql`NULL`, sql`NULL`);
  return u.id;
}

describe("filterToSql: activity date conditions against the database", () => {
  it("matches next activity by preset, absolute day, and emptiness", async () => {
    await withTestDb(async (db) => {
      const uid = await seedThree(db);
      const today = await dbToday(db);
      expect(
        await titlesMatching(db, uid, { field: "nextActivityAt", op: "eq", value: "today" }),
      ).toEqual(["due-today"]);
      expect(
        await titlesMatching(db, uid, { field: "nextActivityAt", op: "eq", value: today }),
      ).toEqual(["due-today"]);
      expect(
        await titlesMatching(db, uid, { field: "nextActivityAt", op: "eq", value: "next_7_days" }),
      ).toEqual(["due-in-3-days", "due-today"]);
      expect(
        await titlesMatching(db, uid, { field: "nextActivityAt", op: "gt", value: "today" }),
      ).toEqual(["due-in-3-days"]);
      expect(
        await titlesMatching(db, uid, { field: "nextActivityAt", op: "neq", value: "today" }),
      ).toEqual(["due-in-3-days", "no-activity"]);
      expect(await titlesMatching(db, uid, { field: "nextActivityAt", op: "isEmpty" })).toEqual([
        "no-activity",
      ]);
    });
  });

  it("places an evening activity on the viewer's local day, not the UTC day", async () => {
    await withTestDb(async (db) => {
      const uid = await seedThree(db);
      await db.execute(
        sql`UPDATE deals SET next_activity_at = '2026-09-03T02:00:00Z' WHERE title = 'due-today'`,
      );
      const utc = { field: "nextActivityAt", op: "eq", value: "2026-09-03" } as const;
      const local = { field: "nextActivityAt", op: "eq", value: "2026-09-02" } as const;
      expect(await titlesMatching(db, uid, utc, "UTC")).toEqual(["due-today"]);
      expect(await titlesMatching(db, uid, local, "UTC")).toEqual([]);
      expect(await titlesMatching(db, uid, local, "America/New_York")).toEqual(["due-today"]);
      expect(await titlesMatching(db, uid, utc, "America/New_York")).toEqual([]);
    });
  });

  it("runs every preset against both column kinds and puts today inside the current periods", async () => {
    await withTestDb(async (db) => {
      const uid = await seedThree(db);
      const containsToday = [
        "today",
        "this_week",
        "this_month",
        "last_7_days",
        "next_7_days",
        "last_30_days",
        "next_30_days",
      ];
      for (const key of DATE_PRESET_KEYS) {
        const next = await titlesMatching(
          db,
          uid,
          { field: "nextActivityAt", op: "eq", value: key },
          "America/New_York",
        );
        await titlesMatching(db, uid, { field: "expectedCloseDate", op: "eq", value: key });
        if (containsToday.includes(key)) expect(next, key).toContain("due-today");
        else expect(next, key).not.toContain("due-today");
      }
    });
  });

  it("matches last activity by a trailing window", async () => {
    await withTestDb(async (db) => {
      const uid = await seedThree(db);
      expect(
        await titlesMatching(db, uid, { field: "lastActivityAt", op: "eq", value: "last_30_days" }),
      ).toEqual(["due-today"]);
      expect(
        await titlesMatching(db, uid, { field: "lastActivityAt", op: "lt", value: "last_30_days" }),
      ).toEqual(["due-in-3-days"]);
      expect(
        await titlesMatching(db, uid, { field: "lastActivityAt", op: "eq", value: "last_7_days" }),
      ).toEqual([]);
    });
  });
});
