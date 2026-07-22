import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { channelVersions } from "@/db/schema/realtime";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDef, setDefFlags } from "@/features/custom-fields/defsRepo";
import { createDeal } from "./dealActions";

function regular(userId: string) {
  return {
    userId,
    isAdmin: false,
    visibilityGroupIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    isActive: true,
    sessionLive: true,
    flags: { "deal.create": true } as Record<string, boolean>,
  };
}

// Unwrap the first stage or throw; test data always has at least one stage.
function firstStageId(p: Awaited<ReturnType<typeof seedPipelineWithStages>>): string {
  const s = p.stages[0];
  if (s === undefined) throw new Error("seedPipelineWithStages returned no stages");
  return s.id;
}

describe("createDeal", () => {
  // Codex finding F27: createDeal wrote the caller-provided status directly, bypassing the
  // won/lost transition logic that stamps wonTime/lostTime and requires a lost reason. That
  // let a caller create a "won"/"lost" deal with no transition metadata, corrupting stats.
  // A newly created deal is always open; closing goes through updateDeal.
  it("ignores a caller-supplied closed status and always creates an open deal", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        regular(u.id),
        {
          title: "Sneaky won",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          status: "won",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.status).toBe("open");
      expect(r.value.wonTime).toBeNull();
      expect(r.value.lostTime).toBeNull();
    });
  });

  // Codex finding F28: createDeal gated the restricted-pipeline group but never is_archived,
  // so a stale archived pipelineId/stageId could create an open deal that every read path
  // then hides, an effectively lost record that bypasses the archived-pipeline invariant.
  it("rejects creating a deal in an archived pipeline", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"], { isArchived: true });
      const r = await createDeal(
        db,
        regular(u.id),
        { title: "into archived", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      const rows = await db.select().from(deals);
      expect(rows).toHaveLength(0);
    });
  });

  it("derives owner + all-level visibility and inserts the deal", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Qualified"]);
      const r = await createDeal(
        db,
        regular(u.id),
        {
          title: "Acme renewal",
          pipelineId: p.pipeline.id,
          stageId: firstStageId(p),
          value: 25000,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const rows = await db.select().from(deals).where(eq(deals.id, r.value.id));
      const row = rows[0];
      expect(row).toBeDefined();
      if (row === undefined) return;
      expect(row.ownerId).toBe(u.id);
      expect(row.visibilityLevel).toBe("all");
      expect(row.value).toBe("25000.00");
    });
  });

  it("ignores client-supplied ownerId and visibilityLevel (server derives both)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const impersonated = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Open"]);
      // Raw input includes ownerId and visibilityLevel: dealCreateInput strips them
      // at the Zod boundary so they never reach the insert.
      const rawWithTrustedFields: unknown = {
        title: "Spoofed deal",
        pipelineId: p.pipeline.id,
        stageId: firstStageId(p),
        ownerId: impersonated.id,
        visibilityLevel: "owner",
      };
      const r = await createDeal(
        db,
        regular(u.id),
        rawWithTrustedFields,
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const rows = await db.select().from(deals).where(eq(deals.id, r.value.id));
      const row = rows[0];
      expect(row).toBeDefined();
      if (row === undefined) return;
      // Must be the session user, not the impersonated user.
      expect(row.ownerId).toBe(u.id);
      // Must be derived from settings, not the client-supplied 'owner'.
      expect(row.visibilityLevel).toBe("all");
    });
  });

  it("inserts the deal at the bottom of the stage column (board_position > existing max)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Stage"]);
      const stageId = firstStageId(p);
      // Insert first deal.
      const r1 = await createDeal(
        db,
        regular(u.id),
        { title: "First", pipelineId: p.pipeline.id, stageId },
        new AbortController().signal,
      );
      expect(r1.ok).toBe(true);
      // Insert second deal; it should get a larger board_position.
      const r2 = await createDeal(
        db,
        regular(u.id),
        { title: "Second", pipelineId: p.pipeline.id, stageId },
        new AbortController().signal,
      );
      expect(r2.ok).toBe(true);
      if (r1.ok === false || r2.ok === false) return;
      expect(Number(r2.value.boardPosition)).toBeGreaterThan(Number(r1.value.boardPosition));
    });
  });

  it("rejects a stage that does not belong to the pipeline", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const a = await seedPipelineWithStages(db, ["A1"]);
      const b = await seedPipelineWithStages(db, ["B1"]);
      const r = await createDeal(
        db,
        regular(u.id),
        { title: "X", pipelineId: a.pipeline.id, stageId: firstStageId(b) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_DEAL_003");
    });
  });

  it("rejects group-level default with no resolvable group", async () => {
    await withTestDb(async (db) => {
      // Default level is 'group' but session has no groups.
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "group", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["S1"]);
      const r = await createDeal(
        db,
        regular(u.id), // visibilityGroupIds: [], primaryVisibilityGroupId: null
        { title: "Orphan", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      // E_PERM_003 = group-level create with no resolvable group.
      expect(r.error.id).toBe("E_PERM_003");
    });
  });

  it("emits a deal_created board event (channel_versions bump) in the same transaction", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["Discovery"]);
      const r = await createDeal(
        db,
        regular(u.id),
        { title: "Event test", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      // Verify the channel_versions row was bumped for this pipeline's channel.
      const channel = `pipeline:${p.pipeline.id}`;
      const cvRows = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      const cv = cvRows[0];
      expect(cv).toBeDefined();
      if (cv === undefined) return;
      expect(Number(cv.version)).toBeGreaterThanOrEqual(1);
    });
  });

  it("requires Important deal fields on create and persists submitted values", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const signal = new AbortController().signal;
      const field = await createDef(
        db,
        { targetEntity: "deal", type: "text", name: "Account Tier" },
        signal,
      );
      if (field.ok === false) throw field.error;
      const flags = await setDefFlags(
        db,
        { id: field.value.id, isImportant: true, showInAddForm: false },
        signal,
      );
      if (flags.ok === false) throw flags.error;

      const user = await seedUser(db);
      const pipeline = await seedPipelineWithStages(db, ["Qualified"]);
      const base = {
        title: "Required field test",
        pipelineId: pipeline.pipeline.id,
        stageId: firstStageId(pipeline),
      };
      const missing = await createDeal(db, regular(user.id), base, signal);
      expect(missing.ok).toBe(false);
      if (missing.ok === false) expect(missing.error.id).toBe("E_CF_003");

      const created = await createDeal(
        db,
        regular(user.id),
        { ...base, customFields: { account_tier: "Enterprise" } },
        signal,
      );
      expect(created.ok).toBe(true);
      if (created.ok === true) {
        expect(created.value.customFields).toEqual({ account_tier: "Enterprise" });
      }
    });
  });
});
