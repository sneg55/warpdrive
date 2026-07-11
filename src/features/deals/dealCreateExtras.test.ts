import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";

function session(userId: string, flags: Record<string, boolean>) {
  return {
    userId,
    isAdmin: false,
    visibilityGroupIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    isActive: true,
    sessionLive: true,
    flags: { "deal.create": true, ...flags },
  };
}

async function seedSettings(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
}

function firstStageId(p: Awaited<ReturnType<typeof seedPipelineWithStages>>): string {
  const s = p.stages[0];
  if (s === undefined) throw new Error("no stages");
  return s.id;
}

describe("createDeal extras (label / source / owner override)", () => {
  it("persists label, source channel and source channel id", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        session(u.id, {}),
        {
          title: "Sourced deal",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          labels: ["hot", "warm"],
          sourceChannel: "web_form",
          sourceChannelId: "utm_campaign=spring",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const [row] = await db.select().from(deals).where(eq(deals.id, r.value.id));
      expect(row?.labels).toEqual(["hot", "warm"]);
      expect(row?.sourceChannel).toBe("web_form");
      expect(row?.sourceChannelId).toBe("utm_campaign=spring");
    });
  });

  it("persists an arbitrary catalog label name (labels are no longer a fixed enum)", async () => {
    // Labels are user-managed in the catalog, so the boundary accepts any well-formed name and
    // stores it verbatim; the catalog UI is the control point for which names exist.
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        session(u.id, {}),
        {
          title: "Custom label",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          labels: ["Enterprise"],
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const [row] = await db.select().from(deals).where(eq(deals.id, r.value.id));
      expect(row?.labels).toEqual(["Enterprise"]);
    });
  });

  it("honors ownerId when the actor holds deal.changeOwner", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const creator = await seedUser(db);
      const target = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        session(creator.id, { "deal.changeOwner": true }),
        {
          title: "Assigned deal",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          ownerId: target.id,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const [row] = await db.select().from(deals).where(eq(deals.id, r.value.id));
      expect(row?.ownerId).toBe(target.id);
    });
  });

  it("ignores ownerId when the actor lacks deal.changeOwner (creator owns it)", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const creator = await seedUser(db);
      const target = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        session(creator.id, {}),
        {
          title: "Not assigned",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          ownerId: target.id,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const [row] = await db.select().from(deals).where(eq(deals.id, r.value.id));
      expect(row?.ownerId).toBe(creator.id);
    });
  });

  it("rejects an owner override pointing at a nonexistent user", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const creator = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        session(creator.id, { "deal.changeOwner": true }),
        {
          title: "Ghost owner",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          ownerId: "00000000-0000-0000-0000-000000000000",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_USER_001");
    });
  });
});
