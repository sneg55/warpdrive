import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { deals, userPreferences } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createCaller } from "@/server/trpc/root";

const NY = "America/New_York";
const TOKYO = "Asia/Tokyo";

async function seedBoard(db: Db) {
  const u = await seedUser(db);
  const p = await seedPipelineWithStages(db, ["A"]);
  await db.insert(deals).values({
    title: "evening call",
    pipelineId: p.pipeline.id,
    stageId: p.stages[0]?.id ?? "",
    ownerId: u.id,
    visibilityLevel: "all",
    nextActivityAt: new Date("2026-09-03T02:00:00.000Z"),
  });
  const caller = createCaller({
    db,
    session: { userId: u.id, sessionId: "test-session" },
    actor: {
      id: u.id,
      type: "admin" as const,
      isActive: true,
      name: "Test User",
      email: "test@example.com",
      avatarUrl: null,
      flags: new Set(),
      groupIds: new Set(),
    },
  });
  return { userId: u.id, pipelineId: p.pipeline.id, caller };
}

function onDay(day: string) {
  return { conditions: [{ field: "nextActivityAt" as const, op: "eq" as const, value: day }] };
}

describe("deal.board date conditions and the viewer's zone", () => {
  it("uses the browser zone sent with the request when no preference is set", async () => {
    await withTestDb(async (db) => {
      const { pipelineId, caller } = await seedBoard(db);
      const local = await caller.deal.board({
        pipelineId,
        definition: onDay("2026-09-02"),
        timeZone: NY,
      });
      expect(local.cards.map((c) => c.title)).toEqual(["evening call"]);
      const utc = await caller.deal.board({ pipelineId, definition: onDay("2026-09-02") });
      expect(utc.cards).toEqual([]);
    });
  });

  it("prefers the saved timezone preference over the browser zone", async () => {
    await withTestDb(async (db) => {
      const { userId, pipelineId, caller } = await seedBoard(db);
      await db.insert(userPreferences).values({ userId, timezone: TOKYO });
      const tokyoDay = await caller.deal.board({
        pipelineId,
        definition: onDay("2026-09-03"),
        timeZone: NY,
      });
      expect(tokyoDay.cards.map((c) => c.title)).toEqual(["evening call"]);
      const nyDay = await caller.deal.board({
        pipelineId,
        definition: onDay("2026-09-02"),
        timeZone: NY,
      });
      expect(nyDay.cards).toEqual([]);
    });
  });

  it("applies the same zone to the list read", async () => {
    await withTestDb(async (db) => {
      const { pipelineId, caller } = await seedBoard(db);
      const res = await caller.deal.list({
        pipelineId,
        definition: onDay("2026-09-02"),
        timeZone: NY,
      });
      expect(res.rows.map((r) => r.title)).toEqual(["evening call"]);
    });
  });
});
