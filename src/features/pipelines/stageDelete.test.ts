import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { channelVersions } from "@/db/schema/realtime";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createPipeline, createStage, renamePipeline } from "./pipelineActions";
import { listVisiblePipelines } from "./pipelineRouter";
import { deleteStage } from "./stageActions";

function adminSession(userId: string) {
  return {
    userId,
    isActive: true,
    sessionLive: true,
    isAdmin: true,
    visibilityGroupIds: [] as string[],
    flags: { "pipeline.manage": true } as Record<string, boolean>,
  };
}

const sig = () => new AbortController().signal;

async function pipelineWith(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  s: ReturnType<typeof adminSession>,
  names: string[],
) {
  const p = await createPipeline(db, s, { name: "Sales", visibilityGroupId: null }, sig());
  if (p.ok !== true) throw new Error("pipeline create failed");
  const stages = [];
  for (const name of names) {
    const st = await createStage(db, s, { pipelineId: p.value.id, name }, sig());
    if (st.ok !== true) throw new Error("stage create failed");
    stages.push(st.value);
  }
  return { pipeline: p.value, stages };
}

describe("deleteStage", () => {
  it("deletes an empty stage and removes it from the pipeline", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { pipeline, stages } = await pipelineWith(db, s, ["A", "B", "C"]);
      const target = stages[1]!;

      const r = await deleteStage(db, s, { stageId: target.id }, sig());
      expect(r.ok).toBe(true);

      const list = await listVisiblePipelines(db, s, sig());
      const row = list.find((p) => p.id === pipeline.id);
      expect(row?.stages.map((st) => st.name)).toEqual(["A", "C"]);
    });
  });

  it("refuses to delete a stage that still holds deals", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { pipeline, stages } = await pipelineWith(db, s, ["A", "B"]);
      const target = stages[0]!;
      await db.insert(deals).values({
        title: "Stuck deal",
        pipelineId: pipeline.id,
        stageId: target.id,
        ownerId: admin.id,
        visibilityLevel: "all",
      });

      const r = await deleteStage(db, s, { stageId: target.id }, sig());
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_STAGE_002");

      // Stage must still be present.
      const list = await listVisiblePipelines(db, s, sig());
      const row = list.find((p) => p.id === pipeline.id);
      expect(row?.stages.some((st) => st.id === target.id)).toBe(true);
    });
  });

  it("moves every deal, open, closed and soft-deleted, to the destination and keeps their stage clocks", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { pipeline, stages } = await pipelineWith(db, s, ["A", "B"]);
      const target = stages[0]!;
      const dest = stages[1]!;
      const enteredAt = new Date("2026-01-02T03:04:05.000Z");
      const base = {
        pipelineId: pipeline.id,
        stageId: target.id,
        ownerId: admin.id,
        visibilityLevel: "all" as const,
        stageEnteredAt: enteredAt,
      };
      await db.insert(deals).values([
        { ...base, title: "Open" },
        { ...base, title: "Won", status: "won" },
        { ...base, title: "Gone", deletedAt: new Date() },
      ]);
      const channel = `pipeline:${pipeline.id}`;
      const before = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      const versionBefore = Number(before[0]?.version ?? 0);

      const r = await deleteStage(
        db,
        s,
        { stageId: target.id, moveDealsToStageId: dest.id },
        sig(),
      );
      expect(r.ok).toBe(true);

      const moved = await db.select().from(deals).where(eq(deals.pipelineId, pipeline.id));
      expect(moved).toHaveLength(3);
      for (const d of moved) {
        expect(d.stageId).toBe(dest.id);
        expect(d.stageEnteredAt.toISOString()).toBe(enteredAt.toISOString());
      }
      const list = await listVisiblePipelines(db, s, sig());
      const row = list.find((p) => p.id === pipeline.id);
      expect(row?.stages.map((st) => st.name)).toEqual(["B"]);

      const after = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      expect(Number(after[0]?.version ?? 0)).toBeGreaterThan(versionBefore);
    });
  });

  it("refuses a destination stage from another pipeline and leaves the deals in place", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { pipeline, stages } = await pipelineWith(db, s, ["A", "B"]);
      const other = await pipelineWith(db, s, ["X"]);
      const target = stages[0]!;
      await db.insert(deals).values({
        title: "Stuck deal",
        pipelineId: pipeline.id,
        stageId: target.id,
        ownerId: admin.id,
        visibilityLevel: "all",
      });

      const r = await deleteStage(
        db,
        s,
        { stageId: target.id, moveDealsToStageId: other.stages[0]!.id },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_STAGE_004");
      const [deal] = await db.select().from(deals).where(eq(deals.pipelineId, pipeline.id));
      expect(deal?.stageId).toBe(target.id);
    });
  });

  it("refuses the stage itself as the destination", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { stages } = await pipelineWith(db, s, ["A", "B"]);
      const target = stages[0]!;
      const r = await deleteStage(
        db,
        s,
        { stageId: target.id, moveDealsToStageId: target.id },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_STAGE_004");
    });
  });

  it("refuses to delete the pipeline's last remaining stage", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { stages } = await pipelineWith(db, s, ["Only"]);
      const r = await deleteStage(db, s, { stageId: stages[0]!.id }, sig());
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_STAGE_003");
    });
  });

  it("returns STAGE_NOT_FOUND for an unknown stage", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const r = await deleteStage(
        db,
        s,
        { stageId: "00000000-0000-0000-0000-000000000000" },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_STAGE_001");
    });
  });

  it("rejects delete for a regular (non-manage) user", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { stages } = await pipelineWith(db, s, ["A", "B"]);
      const regular = {
        userId: admin.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [] as string[],
        flags: {} as Record<string, boolean>,
      };
      const r = await deleteStage(db, regular, { stageId: stages[0]!.id }, sig());
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.id).toBe("E_PERM_001");
    });
  });
});

describe("renamePipeline", () => {
  it("renames a pipeline", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { pipeline } = await pipelineWith(db, s, ["A"]);
      const r = await renamePipeline(db, s, { pipelineId: pipeline.id, name: "Renamed" }, sig());
      expect(r.ok).toBe(true);

      const list = await listVisiblePipelines(db, s, sig());
      expect(list.find((p) => p.id === pipeline.id)?.name).toBe("Renamed");
    });
  });

  it("rejects rename for a regular user", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const { pipeline } = await pipelineWith(db, s, ["A"]);
      const regular = {
        userId: admin.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [] as string[],
        flags: {} as Record<string, boolean>,
      };
      const r = await renamePipeline(db, regular, { pipelineId: pipeline.id, name: "X" }, sig());
      expect(r.ok).toBe(false);
    });
  });
});
