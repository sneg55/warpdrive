// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { deals, userPreferences } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { boardViewDefinition } from "@/features/deals/boardView";
import { wonDealsDrillDownView } from "@/features/deals/wonDealsDrillDown";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";
import type { OwnerScope } from "@/types/stats";
import { parseDrillDown } from "./drillDown";
import { buildWonDealsHref } from "./drillDownHref";

const FROM = "2026-03-01";
const TO = "2026-03-31";
const NY = "America/New_York";

function adminOf(id: string): HydratedActor {
  return {
    id,
    type: "admin",
    isActive: true,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set(),
    groupIds: new Set<string>(),
  };
}

async function seedWorld(db: Db) {
  const me = await seedUser(db, { isAdmin: true });
  const other = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  const base = {
    pipelineId: p.pipeline.id,
    stageId: p.stages[0]?.id ?? "",
    ownerId: me.id,
    visibilityLevel: "all" as const,
  };
  const at = (iso: string) => new Date(iso);
  await db.insert(deals).values([
    {
      ...base,
      title: "won in range, closes later",
      status: "won",
      wonTime: at("2026-03-15T12:00:00Z"),
      expectedCloseDate: "2027-01-01",
    },
    { ...base, title: "won after range", status: "won", wonTime: at("2026-04-02T12:00:00Z") },
    { ...base, title: "open, closes in range", expectedCloseDate: "2026-03-10" },
    { ...base, title: "lost in range", status: "lost", lostTime: at("2026-03-12T12:00:00Z") },
    {
      ...base,
      title: "someone else won",
      ownerId: other.id,
      status: "won",
      wonTime: at("2026-03-20T12:00:00Z"),
    },
    {
      ...base,
      title: "won just after UTC midnight on the first",
      status: "won",
      wonTime: at("2026-03-01T02:00:00Z"),
    },
    {
      ...base,
      title: "won on the evening of the last day in New York",
      status: "won",
      wonTime: at("2026-04-01T02:00:00Z"),
    },
    {
      ...base,
      title: "won late on the last day in New York",
      status: "won",
      wonTime: at("2026-04-01T03:30:00Z"),
    },
  ]);
  return { me, other, pipelineId: p.pipeline.id };
}

async function compare(
  db: Db,
  actor: HydratedActor,
  owner: OwnerScope,
  pipelineId: string,
  browserZone = "UTC",
) {
  const caller = createCaller({ db, session: { userId: actor.id, sessionId: "s" }, actor });
  const dash = await caller.stats.dashboard({
    ownerScope: owner,
    pipelineId,
    from: FROM,
    to: TO,
    timeZone: browserZone,
  });
  const href = buildWonDealsHref({ owner, pipelineId, from: FROM, to: TO });
  const params = Object.fromEntries(new URL(href ?? "", "http://x").searchParams.entries());
  const drill = parseDrillDown(params, "won");
  if (drill === null) throw new Error("drill-down href did not parse");
  const view = wonDealsDrillDownView(drill, actor.id);
  const list = await caller.deal.list({
    pipelineId,
    definition: boardViewDefinition(view),
    timeZone: browserZone,
  });
  const titles = list.rows.map((r) => r.title).sort();
  return { tile: dash.dealPerformance.won.count, list: list.total, view, titles };
}

describe("Deals won tile drill-down parity", () => {
  it("lists exactly the won deals the tile counted for me", async () => {
    await withTestDb(async (db) => {
      const { me, pipelineId } = await seedWorld(db);
      const r = await compare(db, adminOf(me.id), { kind: "me" }, pipelineId);
      expect(r.tile).toBe(2);
      expect(r.list).toBe(r.tile);
      expect(r.view.ownerId).toBeNull();
    });
  });

  it("lists exactly the won deals the tile counted for everyone and for a named user", async () => {
    await withTestDb(async (db) => {
      const { me, other, pipelineId } = await seedWorld(db);
      const everyone = await compare(db, adminOf(me.id), { kind: "all" }, pipelineId);
      expect(everyone.tile).toBe(3);
      expect(everyone.list).toBe(everyone.tile);
      const named = await compare(
        db,
        adminOf(me.id),
        { kind: "user", userId: other.id },
        pipelineId,
      );
      expect(named.tile).toBe(1);
      expect(named.list).toBe(named.tile);
    });
  });

  it("counts local days for a viewer whose saved timezone is New York", async () => {
    await withTestDb(async (db) => {
      const { me, pipelineId } = await seedWorld(db);
      await db.insert(userPreferences).values({ userId: me.id, timezone: NY });
      const r = await compare(db, adminOf(me.id), { kind: "me" }, pipelineId);
      expect(r.tile).toBe(3);
      expect(r.list).toBe(r.tile);
      expect(r.titles).toEqual([
        "won in range, closes later",
        "won late on the last day in New York",
        "won on the evening of the last day in New York",
      ]);
    });
  });

  it("counts local days for a New York browser with no saved timezone", async () => {
    await withTestDb(async (db) => {
      const { me, pipelineId } = await seedWorld(db);
      const r = await compare(db, adminOf(me.id), { kind: "me" }, pipelineId, NY);
      expect(r.tile).toBe(3);
      expect(r.list).toBe(r.tile);
      expect(r.titles).toEqual([
        "won in range, closes later",
        "won late on the last day in New York",
        "won on the evening of the last day in New York",
      ]);
    });
  });
});
