import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";
import { getBoardColumns, getStageSums, listDeals } from "./dealRepo";

// Admin session: sees all deals regardless of visibility level
function admin(userId: string) {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: {} as Record<string, boolean>,
  };
}

// Regular (non-admin) session with no group membership: sees only own deals
// when default visibility is "owner"
function ownerOnly(userId: string) {
  return {
    userId,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: {} as Record<string, boolean>,
  };
}

describe("board reads", () => {
  it("returns visible open cards ordered within a stage", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("no stage");
      await createDeal(
        db,
        admin(u.id),
        { title: "First", pipelineId: p.pipeline.id, stageId: stage.id, value: 100 },
        new AbortController().signal,
      );
      await createDeal(
        db,
        admin(u.id),
        { title: "Second", pipelineId: p.pipeline.id, stageId: stage.id, value: 200 },
        new AbortController().signal,
      );
      const { cards } = await getBoardColumns(
        db,
        admin(u.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      expect(cards.map((c) => c.title)).toEqual(["First", "Second"]);
    });
  });

  // RUNTIME CONTRACT: raw pg returns timestamptz as strings; BoardCard types them
  // as Date. Consumers call .toISOString()/.getTime() so the rows MUST be coerced.
  it("returns Date instances for timestamp columns (board)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("no stage");
      const created = await createDeal(
        db,
        admin(u.id),
        { title: "Timed", pipelineId: p.pipeline.id, stageId: stage.id, value: 100 },
        new AbortController().signal,
      );
      if (!created.ok) throw new Error("createDeal failed");
      // Set a next-activity timestamp directly (createDeal does not accept it).
      const when = new Date("2026-07-01T12:00:00.000Z");
      await db.update(deals).set({ nextActivityAt: when }).where(eq(deals.id, created.value.id));

      const { cards } = await getBoardColumns(
        db,
        admin(u.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      const card = cards[0];
      if (!card) throw new Error("no card");
      expect(card.updatedAt).toBeInstanceOf(Date);
      expect(card.stageEnteredAt).toBeInstanceOf(Date);
      // Nullable activity field: Date when set
      expect(card.nextActivityAt).toBeInstanceOf(Date);
      expect(card.nextActivityAt?.getTime()).toBe(when.getTime());
      // lastActivityAt was never set, so it must be null (not the string "null")
      expect(card.lastActivityAt).toBeNull();
      // .toISOString() must not throw (the exact call the board page makes)
      expect(() => card.updatedAt.toISOString()).not.toThrow();
    });
  });

  it("returns Date instances for timestamp columns (listDeals)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("no stage");
      await createDeal(
        db,
        admin(u.id),
        { title: "Listed", pipelineId: p.pipeline.id, stageId: stage.id, value: 100 },
        new AbortController().signal,
      );
      const { rows } = await listDeals(
        db,
        admin(u.id),
        { pipelineId: p.pipeline.id, offset: 0, limit: 50 },
        new AbortController().signal,
      );
      const row = rows[0];
      if (!row) throw new Error("no row");
      expect(row.updatedAt).toBeInstanceOf(Date);
      expect(row.stageEnteredAt).toBeInstanceOf(Date);
      expect(row.lastActivityAt).toBeNull();
      expect(() => row.updatedAt.toISOString()).not.toThrow();
    });
  });

  it("sums open value per stage", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stageA = p.stages[0];
      if (!stageA) throw new Error("no stage A");
      await createDeal(
        db,
        admin(u.id),
        { title: "a1", pipelineId: p.pipeline.id, stageId: stageA.id, value: 100 },
        new AbortController().signal,
      );
      await createDeal(
        db,
        admin(u.id),
        { title: "a2", pipelineId: p.pipeline.id, stageId: stageA.id, value: 50 },
        new AbortController().signal,
      );
      const sums = await getStageSums(db, admin(u.id), p.pipeline.id, new AbortController().signal);
      const a = sums.find((s) => s.stageId === stageA.id);
      expect(a?.dealCount).toBe(2);
      expect(Number(a?.total)).toBe(150);
    });
  });

  // SECURITY: visibility predicate must filter hidden deals from BOTH board and sums.
  it("excludes owner-only deals from board when viewed by a different user", async () => {
    await withTestDb(async (db) => {
      // "owner" default so deals are visible to owner only
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "owner", person: "all", organization: "all" },
      });
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Stage"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("no stage");

      await createDeal(
        db,
        ownerOnly(owner.id),
        { title: "Hidden Deal", pipelineId: p.pipeline.id, stageId: stage.id, value: 9999 },
        new AbortController().signal,
      );

      // viewer (different user, non-admin) must not see the deal
      const { cards } = await getBoardColumns(
        db,
        ownerOnly(viewer.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      expect(cards).toHaveLength(0);
    });
  });

  it("excludes hidden deal value from stage sums when viewed by a different user", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "owner", person: "all", organization: "all" },
      });
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Stage"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("no stage");

      await createDeal(
        db,
        ownerOnly(owner.id),
        { title: "Hidden", pipelineId: p.pipeline.id, stageId: stage.id, value: 5000 },
        new AbortController().signal,
      );

      const sums = await getStageSums(
        db,
        ownerOnly(viewer.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      // Stage must be absent from results (GROUP BY yields no rows when predicate
      // excludes all deals for that stage).
      const s = sums.find((r) => r.stageId === stage.id);
      expect(s).toBeUndefined();
    });
  });

  it("hidden deal appears in neither board nor sums for the non-owner", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "owner", person: "all", organization: "all" },
      });
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Stage"]);
      const stage = p.stages[0];
      if (!stage) throw new Error("no stage");

      await createDeal(
        db,
        ownerOnly(owner.id),
        { title: "Private", pipelineId: p.pipeline.id, stageId: stage.id, value: 1234 },
        new AbortController().signal,
      );

      const { cards } = await getBoardColumns(
        db,
        ownerOnly(viewer.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      const sums = await getStageSums(
        db,
        ownerOnly(viewer.id),
        p.pipeline.id,
        new AbortController().signal,
      );

      // not in board
      expect(cards.find((c) => c.title === "Private")).toBeUndefined();
      // not in sums (stage absent from GROUP BY result)
      expect(sums.find((r) => r.stageId === stage.id)).toBeUndefined();
    });
  });
});
