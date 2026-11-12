// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deals, userPreferences } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { getPreferences } from "@/features/identity/preferencesRepo";
import type { HydratedActor } from "@/server/hydrateActor";
import { DEFAULT_BOARD_VIEW } from "./boardView";
import { loadDealListPageData } from "./dealListPageData";
import { wonDealsDrillDownView } from "./wonDealsDrillDown";

const PERSISTED = {
  ownerId: null,
  sortKey: DEFAULT_BOARD_VIEW.sortKey,
  sortDir: DEFAULT_BOARD_VIEW.sortDir,
  savedFilterId: null,
  conditions: {
    combinator: "and" as const,
    conditions: [{ field: "title" as const, op: "contains" as const, value: "nothing-matches" }],
  },
};

describe("loadDealListPageData with a drill-down view", () => {
  it("renders the drill-down rows and leaves the persisted board view untouched", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { isAdmin: true });
      const p = await seedPipelineWithStages(db, ["A"]);
      const base = {
        pipelineId: p.pipeline.id,
        stageId: p.stages[0]?.id ?? "",
        ownerId: u.id,
        visibilityLevel: "all" as const,
      };
      await db.insert(deals).values([
        { ...base, title: "won", status: "won", wonTime: new Date("2026-03-15T12:00:00Z") },
        { ...base, title: "open" },
      ]);
      await db.insert(userPreferences).values({ userId: u.id, ui: { boardView: PERSISTED } });
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
      const view = wonDealsDrillDownView(
        { owner: "me", from: "2026-03-01", to: "2026-03-31", pipelineId: p.pipeline.id },
        u.id,
      );

      const out = await loadDealListPageData(
        { db, session: { userId: u.id, sessionId: "s" }, actor },
        { pipelineId: p.pipeline.id, archived: false, viewOverride: view },
      );

      expect(out.initialView).toEqual(view);
      expect(out.list.rows.map((r) => r.title)).toEqual(["won"]);
      expect(out.unfilteredTotal).toBe(1);
      const prefs = await getPreferences(db, u.id, new AbortController().signal);
      expect(prefs.ui.boardView).toEqual(PERSISTED);
    });
  });
});
