import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createCaller } from "@/server/trpc/root";

describe("appRouter deal namespace", () => {
  it("exposes pipeline.list and deal.board to an authorized session", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const caller = createCaller({
        db,
        session: { userId: u.id, sessionId: "test-session" },
        actor: {
          id: u.id,
          type: "admin" as const,
          isActive: true,
          name: "Test User",
          avatarUrl: null,
          flags: new Set(),
          groupIds: new Set(),
        },
      });
      const pipelines = await caller.pipeline.list();
      expect(pipelines.length).toBeGreaterThan(0);
      const board = await caller.deal.board({ pipelineId: p.pipeline.id });
      expect(Array.isArray(board.cards)).toBe(true);
    });
  });
});
