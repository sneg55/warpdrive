// dealMovePerms.test.ts: permission enforcement + realtime event tests for moveDeal.
// CAS + stage-validation tests live in dealMove.test.ts.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { channelVersions } from "@/db/schema/realtime";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal, moveDeal } from "./dealActions";
import {
  adminSession,
  createSession,
  noEditSession,
  regularSession,
  seedSettings,
} from "./dealMove.test-helpers";

describe("moveDeal: permissions", () => {
  it("denies a regular user who has no deal.edit flag", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(owner.id),
        { title: "Owner deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      // other user has no deal.edit_* flag; deal is "all" visibility so it is visible
      const r = await moveDeal(
        db,
        noEditSession(other.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      // Visible but no edit flag -> PERM_DENIED
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("denies a user with deal.edit_own who does not own the deal", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(owner.id),
        { title: "Not-your deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      // other has deal.edit_own but is not the owner
      const r = await moveDeal(
        db,
        regularSession(other.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("allows a user with deal.edit_own to move their own deal", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const owner = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(owner.id),
        { title: "Own deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      // owner has deal.edit_own and IS the owner
      const r = await moveDeal(
        db,
        regularSession(owner.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.stageId).toBe(stage1.id);
    });
  });

  it("returns E_DEAL_001 when user cannot see the deal (404-on-invisible)", async () => {
    await withTestDb(async (db) => {
      // owner-level default: only owner can see the deal
      await seedSettings(db, "owner");
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(owner.id),
        { title: "Secret deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      // stranger with edit_own cannot see this deal (visibility: owner, ownerId: owner)
      const r = await moveDeal(
        db,
        regularSession(stranger.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );

      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      // Not visible -> 404-on-invisible
      expect(r.error.id).toBe("E_DEAL_001");
    });
  });
});

describe("moveDeal: realtime event", () => {
  it("emits deal_moved event (channel_versions bump) in the same transaction", async () => {
    await withTestDb(async (db) => {
      await seedSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A", "B"]);
      const stage0 = p.stages[0];
      const stage1 = p.stages[1];
      if (stage0 === undefined || stage1 === undefined) throw new Error("setup: missing stages");

      const created = await createDeal(
        db,
        createSession(u.id),
        { title: "Event deal", pipelineId: p.pipeline.id, stageId: stage0.id },
        new AbortController().signal,
      );
      if (created.ok === false) throw new Error(`createDeal failed: ${created.error.message}`);

      const channel = `pipeline:${p.pipeline.id}`;
      const beforeRows = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      const versionBefore = Number(beforeRows[0]?.version ?? 0);

      const r = await moveDeal(
        db,
        adminSession(u.id),
        {
          dealId: created.value.id,
          toStageId: stage1.id,
          beforePosition: null,
          afterPosition: null,
          expectedUpdatedAt: created.value.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);

      const afterRows = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      const versionAfter = Number(afterRows[0]?.version ?? 0);
      expect(versionAfter).toBeGreaterThan(versionBefore);
    });
  });
});
