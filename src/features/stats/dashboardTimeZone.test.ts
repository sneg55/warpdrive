// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { activities, deals, userPreferences } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { callTypeId } from "@/features/activities/activityRowsTestHelpers";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";

const NY = "America/New_York";
const MARCH = { from: "2026-03-01", to: "2026-03-31" };
const BEFORE_LOCAL_MARCH = new Date("2026-03-01T02:00:00Z");
const LAST_LOCAL_EVENING = new Date("2026-04-01T02:00:00Z");

async function seedEdges(db: Db) {
  const u = await seedUser(db, { isAdmin: true });
  const p = await seedPipelineWithStages(db, ["Qualify"]);
  const base = {
    pipelineId: p.pipeline.id,
    stageId: p.stages[0]?.id ?? "",
    ownerId: u.id,
    visibilityLevel: "all" as const,
  };
  const seeded = await db
    .insert(deals)
    .values([
      {
        ...base,
        title: "won and created before local March",
        status: "won",
        value: "100",
        createdAt: BEFORE_LOCAL_MARCH,
        wonTime: BEFORE_LOCAL_MARCH,
      },
      {
        ...base,
        title: "lost on the last local evening",
        status: "lost",
        value: "50",
        lostReason: "Price",
        createdAt: LAST_LOCAL_EVENING,
        lostTime: LAST_LOCAL_EVENING,
      },
      {
        ...base,
        title: "won on the last local evening",
        status: "won",
        value: "300",
        createdAt: new Date("2026-03-10T12:00:00Z"),
        wonTime: LAST_LOCAL_EVENING,
      },
      { ...base, title: "opened on the last local evening", createdAt: LAST_LOCAL_EVENING },
    ])
    .returning({ id: deals.id });
  const dealId = seeded[0]?.id ?? null;
  const typeId = await callTypeId(db);
  await db.insert(activities).values([
    {
      typeId,
      subject: "early",
      ownerId: u.id,
      assigneeId: u.id,
      dealId,
      done: true,
      doneAt: BEFORE_LOCAL_MARCH,
    },
    {
      typeId,
      subject: "late",
      ownerId: u.id,
      assigneeId: u.id,
      dealId,
      done: true,
      doneAt: LAST_LOCAL_EVENING,
    },
    {
      typeId,
      subject: "late too",
      ownerId: u.id,
      assigneeId: u.id,
      dealId,
      done: true,
      doneAt: LAST_LOCAL_EVENING,
    },
  ]);
  const actor: HydratedActor = {
    id: u.id,
    type: "admin",
    isActive: true,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set(),
    groupIds: new Set<string>(),
  };
  const caller = createCaller({ db, session: { userId: u.id, sessionId: "s" }, actor });
  return { caller, userId: u.id, pipelineId: p.pipeline.id };
}

type Caller = Awaited<ReturnType<typeof seedEdges>>["caller"];

async function expectNewYorkMarch(caller: Caller, pipelineId: string, timeZone?: string) {
  const out = await caller.stats.dashboard({
    ownerScope: { kind: "me" },
    pipelineId,
    ...MARCH,
    timeZone,
  });
  expect(out.dealPerformance.added.count).toBe(3);
  expect(out.dealPerformance.won).toEqual({ count: 1, value: "300.00" });
  expect(out.dealPerformance.lost.count).toBe(1);
  expect(out.wonDealStats.avgValue).toBe("300.00");
  expect(out.wonTrend).toEqual([{ month: "2026-03", count: 1, value: "300.00" }]);
  expect(out.lostReasons.map((r) => [r.name, r.count])).toEqual([["Price", 1]]);
  expect(out.activities.completed).toBe(2);
  expect(out.activitiesByType.find((t) => t.key === "call")?.completed).toBe(2);
  expect(out.funnel[0]?.reached).toBe(3);
}

describe("dashboard day windows follow the viewer's timezone", () => {
  it("uses the browser zone the client sends when nothing is saved", async () => {
    await withTestDb(async (db) => {
      const { caller, pipelineId } = await seedEdges(db);
      await expectNewYorkMarch(caller, pipelineId, NY);
    });
  });

  it("prefers the saved timezone over the browser zone", async () => {
    await withTestDb(async (db) => {
      const { caller, userId, pipelineId } = await seedEdges(db);
      await db.insert(userPreferences).values({ userId, timezone: NY });
      await expectNewYorkMarch(caller, pipelineId, "UTC");
    });
  });

  it("keeps UTC days when no zone is known", async () => {
    await withTestDb(async (db) => {
      const { caller, pipelineId } = await seedEdges(db);
      const out = await caller.stats.dashboard({
        ownerScope: { kind: "me" },
        pipelineId,
        ...MARCH,
      });
      expect(out.dealPerformance.won).toEqual({ count: 1, value: "100.00" });
      expect(out.dealPerformance.lost.count).toBe(0);
      expect(out.activities.completed).toBe(1);
      expect(out.wonTrend).toEqual([{ month: "2026-03", count: 1, value: "100.00" }]);
    });
  });
});
