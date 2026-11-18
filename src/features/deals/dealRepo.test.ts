import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";
import { getBoardColumns, getStageSums, listDeals } from "./dealRepo";

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
      expect(card.nextActivityAt).toBeInstanceOf(Date);
      expect(card.nextActivityAt?.getTime()).toBe(when.getTime());
      expect(card.lastActivityAt).toBeNull();
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

  it("excludes owner-only deals from board when viewed by a different user", async () => {
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
        { title: "Hidden Deal", pipelineId: p.pipeline.id, stageId: stage.id, value: 9999 },
        new AbortController().signal,
      );

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

      expect(cards.find((c) => c.title === "Private")).toBeUndefined();
      expect(sums.find((r) => r.stageId === stage.id)).toBeUndefined();
    });
  });
});
