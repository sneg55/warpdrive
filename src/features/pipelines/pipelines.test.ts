import { describe, expect, it } from "vitest";
import { DEFAULT_PIPELINE } from "@/constants/defaultCatalog";
import { visibilityGroups } from "@/db/schema/identity";
import { pipelines } from "@/db/schema/pipelines";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  createPipeline,
  createPipelineWithStages,
  createStage,
  reorderStages,
} from "./pipelineActions";
import { listVisiblePipelines } from "./pipelineRouter";

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

describe("pipeline CRUD", () => {
  it("creates a pipeline with stages and lists them ordered", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const p = await createPipeline(
        db,
        s,
        { name: "Sales", visibilityGroupId: null },
        new AbortController().signal,
      );
      expect(p.ok).toBe(true);
      if (p.ok !== true) return;
      await createStage(
        db,
        s,
        { pipelineId: p.value.id, name: "Qualified" },
        new AbortController().signal,
      );
      await createStage(
        db,
        s,
        { pipelineId: p.value.id, name: "Proposal" },
        new AbortController().signal,
      );
      const list = await listVisiblePipelines(db, s, new AbortController().signal);
      expect(list).toHaveLength(1);
      expect(list[0]!.stages.map((st) => st.name)).toEqual(["Qualified", "Proposal"]);
    });
  });

  it("rejects pipeline.manage for a regular user", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const regular = {
        userId: u.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [] as string[],
        flags: {} as Record<string, boolean>,
      };
      const r = await createPipeline(
        db,
        regular,
        { name: "X", visibilityGroupId: null },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
    });
  });

  it("reorders stages by rewriting order", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const p = await createPipeline(
        db,
        s,
        { name: "Sales", visibilityGroupId: null },
        new AbortController().signal,
      );
      if (p.ok !== true) return;
      const a = await createStage(
        db,
        s,
        { pipelineId: p.value.id, name: "A" },
        new AbortController().signal,
      );
      const b = await createStage(
        db,
        s,
        { pipelineId: p.value.id, name: "B" },
        new AbortController().signal,
      );
      if (a.ok !== true || b.ok !== true) return;
      await reorderStages(
        db,
        s,
        { pipelineId: p.value.id, orderedStageIds: [b.value.id, a.value.id] },
        new AbortController().signal,
      );
      const list = await listVisiblePipelines(db, s, new AbortController().signal);
      expect(list[0]!.stages.map((st) => st.name)).toEqual(["B", "A"]);
    });
  });

  it("hides a restricted pipeline from a non-member and shows it to members", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);

      // Seed a visibility group and a pipeline restricted to it.
      const [grp] = await db
        .insert(visibilityGroups)
        .values({ name: "Restricted Group" })
        .returning();
      if (grp === undefined) throw new Error("group insert returned no rows");
      const [restricted] = await db
        .insert(pipelines)
        .values({ name: "Restricted", visibilityGroupId: grp.id })
        .returning();
      if (restricted === undefined) throw new Error("pipeline insert returned no rows");

      // Non-member: restricted pipeline must be hidden (empty list).
      const nonMemberSession = {
        isAdmin: false,
        visibilityGroupIds: [] as string[],
      };
      const hidden = await listVisiblePipelines(db, nonMemberSession, new AbortController().signal);
      expect(hidden.some((p) => p.name === "Restricted")).toBe(false);
      expect(hidden).toHaveLength(0);

      // Member of the group: restricted pipeline is visible (exercises inArray branch).
      const memberSession = {
        isAdmin: false,
        visibilityGroupIds: [grp.id],
      };
      const memberList = await listVisiblePipelines(
        db,
        memberSession,
        new AbortController().signal,
      );
      expect(memberList.some((p) => p.name === "Restricted")).toBe(true);

      // Admin sees the restricted pipeline regardless of membership.
      const adminList = await listVisiblePipelines(db, s, new AbortController().signal);
      expect(adminList.some((p) => p.name === "Restricted")).toBe(true);
    });
  });

  it("createPipelineWithStages inserts the pipeline plus the default stage set in order", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const p = await createPipelineWithStages(
        db,
        s,
        { name: "Sales Pipeline", visibilityGroupId: null },
        new AbortController().signal,
      );
      expect(p.ok).toBe(true);
      if (p.ok !== true) return;
      const list = await listVisiblePipelines(db, s, new AbortController().signal);
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe("Sales Pipeline");
      expect(list[0]!.stages.map((st) => st.name)).toEqual([...DEFAULT_PIPELINE.stages]);
      expect(list[0]!.stages.map((st) => st.order)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  it("createPipelineWithStages denies a non-manage user and writes nothing", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const regular = {
        userId: u.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [] as string[],
        flags: {} as Record<string, boolean>,
      };
      const r = await createPipelineWithStages(
        db,
        regular,
        { name: "X", visibilityGroupId: null },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      const rows = await db.select().from(pipelines);
      expect(rows).toHaveLength(0);
    });
  });

  it("rejects reordering stages that belong to a different pipeline", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const s = adminSession(admin.id);
      const p1 = await createPipeline(
        db,
        s,
        { name: "P1", visibilityGroupId: null },
        new AbortController().signal,
      );
      const p2 = await createPipeline(
        db,
        s,
        { name: "P2", visibilityGroupId: null },
        new AbortController().signal,
      );
      if (p1.ok !== true || p2.ok !== true) return;
      const a1 = await createStage(
        db,
        s,
        { pipelineId: p1.value.id, name: "A1" },
        new AbortController().signal,
      );
      const foreign = await createStage(
        db,
        s,
        { pipelineId: p2.value.id, name: "Foreign" },
        new AbortController().signal,
      );
      if (a1.ok !== true || foreign.ok !== true) return;

      // Pass a stage id from P2 while claiming P1: must be rejected, no rows touched.
      const r = await reorderStages(
        db,
        s,
        { pipelineId: p1.value.id, orderedStageIds: [a1.value.id, foreign.value.id] },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);

      // The foreign stage's order must be unchanged (still 0 within P2).
      const p2List = await listVisiblePipelines(
        db,
        { isAdmin: true, visibilityGroupIds: [] },
        new AbortController().signal,
      );
      const p2Row = p2List.find((p) => p.id === p2.value.id);
      expect(p2Row?.stages.find((st) => st.id === foreign.value.id)?.order).toBe(0);
    });
  });
});
