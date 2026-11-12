// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import { activities, deals, userPreferences } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { callTypeId } from "@/features/activities/activityRowsTestHelpers";
import { completedActivitiesFilter } from "@/features/activities/drillDownFilter";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";
import type { OwnerScope } from "@/types/stats";
import { parseDrillDown } from "./drillDown";
import { buildCompletedActivitiesHref } from "./drillDownHref";

const FROM = "2026-03-01";
const TO = "2026-03-31";
const NY = "America/New_York";

function actorOf(u: { id: string; isAdmin: boolean }, flags: PermissionFlagKey[]): HydratedActor {
  return {
    id: u.id,
    type: u.isAdmin ? "admin" : "regular",
    isActive: true,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set<PermissionFlagKey>(flags),
    groupIds: new Set<string>(),
  };
}

async function seedDeal(db: Db, pipelineId: string, stageId: string, ownerId: string) {
  const [d] = await db
    .insert(deals)
    .values({ title: "d", pipelineId, stageId, ownerId, visibilityLevel: "all" })
    .returning();
  if (d === undefined) throw new Error("deal seed failed");
  return d.id;
}

async function seedWorld(db: Db) {
  const me = await seedUser(db);
  const other = await seedUser(db);
  const typeId = await callTypeId(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  const q = await seedPipelineWithStages(db, ["A"]);
  const onP = await seedDeal(db, p.pipeline.id, p.stages[0]?.id ?? "", me.id);
  const onQ = await seedDeal(db, q.pipeline.id, q.stages[0]?.id ?? "", me.id);
  const base = { typeId, ownerId: me.id, assigneeId: me.id };
  const at = (iso: string) => new Date(iso);
  await db.insert(activities).values([
    {
      ...base,
      subject: "done in range, due before",
      dealId: onP,
      done: true,
      doneAt: at("2026-03-15T10:00:00Z"),
      dueAt: at("2026-02-01T10:00:00Z"),
    },
    {
      ...base,
      subject: "due in range, done after",
      dealId: onP,
      done: true,
      doneAt: at("2026-04-02T10:00:00Z"),
      dueAt: at("2026-03-10T10:00:00Z"),
    },
    { ...base, subject: "no deal", done: true, doneAt: at("2026-03-05T10:00:00Z") },
    {
      ...base,
      subject: "other pipeline",
      dealId: onQ,
      done: true,
      doneAt: at("2026-03-06T10:00:00Z"),
    },
    {
      ...base,
      subject: "someone else",
      assigneeId: other.id,
      dealId: onP,
      done: true,
      doneAt: at("2026-03-07T10:00:00Z"),
    },
    { ...base, subject: "open in range", dealId: onP, dueAt: at("2026-03-08T10:00:00Z") },
    {
      ...base,
      subject: "last minute",
      dealId: onP,
      done: true,
      doneAt: at("2026-03-31T23:30:00Z"),
    },
    {
      ...base,
      subject: "first minute after",
      dealId: onP,
      done: true,
      doneAt: at("2026-04-01T00:00:00Z"),
    },
  ]);
  return { me, other, pipelineId: p.pipeline.id };
}

async function compare(
  db: Db,
  actor: HydratedActor,
  owner: OwnerScope,
  pipelineId: string | null,
  timeZone = "UTC",
): Promise<{ tile: number; list: number; subjects: string[] }> {
  const caller = createCaller({ db, session: { userId: actor.id, sessionId: "s" }, actor });
  const dash = await caller.stats.dashboard({
    ownerScope: owner,
    pipelineId,
    from: FROM,
    to: TO,
    timeZone,
  });
  const href = buildCompletedActivitiesHref({ owner, pipelineId, from: FROM, to: TO });
  const params = Object.fromEntries(new URL(href ?? "", "http://x").searchParams.entries());
  const drill = parseDrillDown(params, "completed");
  if (drill === null) throw new Error("drill-down href did not parse");
  const rows = await caller.activities.listRows({
    ...completedActivitiesFilter(drill, actor.id),
    timeZone,
  });
  const subjects = rows.map((r) => r.subject).sort();
  return { tile: dash.activities.completed, list: rows.length, subjects };
}

describe("Activities completed tile drill-down parity", () => {
  it("lists exactly what the tile counted for me on one pipeline", async () => {
    await withTestDb(async (db) => {
      const { me, pipelineId } = await seedWorld(db);
      const r = await compare(db, actorOf(me, []), { kind: "me" }, pipelineId);
      expect(r.tile).toBe(2);
      expect(r.list).toBe(r.tile);
    });
  });

  it("lists exactly what the tile counted for me across all pipelines", async () => {
    await withTestDb(async (db) => {
      const { me } = await seedWorld(db);
      const r = await compare(db, actorOf(me, []), { kind: "me" }, null);
      expect(r.tile).toBe(4);
      expect(r.list).toBe(r.tile);
    });
  });

  it("lists exactly what the tile counted for everyone and for a named user", async () => {
    await withTestDb(async (db) => {
      const { me, other, pipelineId } = await seedWorld(db);
      const admin = actorOf(await seedUser(db, { isAdmin: true }), []);
      const everyone = await compare(db, admin, { kind: "all" }, pipelineId);
      expect(everyone.tile).toBe(3);
      expect(everyone.list).toBe(everyone.tile);
      const named = await compare(db, admin, { kind: "user", userId: other.id }, null);
      expect(named.tile).toBe(1);
      expect(named.list).toBe(named.tile);
      const self = await compare(db, actorOf(me, ["stats.viewOthers"]), { kind: "all" }, null);
      expect(self.list).toBe(self.tile);
    });
  });

  it("counts local days for a viewer in New York, saved or from the browser", async () => {
    await withTestDb(async (db) => {
      const { me, pipelineId } = await seedWorld(db);
      const expected = ["done in range, due before", "first minute after", "last minute"];
      const browser = await compare(db, actorOf(me, []), { kind: "me" }, pipelineId, NY);
      expect(browser.tile).toBe(3);
      expect(browser.list).toBe(browser.tile);
      expect(browser.subjects).toEqual(expected);
      await db.insert(userPreferences).values({ userId: me.id, timezone: NY });
      const saved = await compare(db, actorOf(me, []), { kind: "me" }, pipelineId);
      expect(saved.list).toBe(saved.tile);
      expect(saved.subjects).toEqual(expected);
    });
  });
});
