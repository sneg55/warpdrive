import { describe, expect, it } from "vitest";
import { deals, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { DealVisibilitySession } from "@/types/session";
import { assertReferenceVisible } from "./referenceCheck";

describe("assertReferenceVisible (Phase 3 real implementation)", () => {
  it("returns the same 404-shape for a hidden person and a nonexistent id", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const actor: DealVisibilitySession = {
        userId: me.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [],
      };

      // owner-visibility person owned by someone else: actor cannot see it
      const [hidden] = await db
        .insert(persons)
        .values({
          name: "Hidden",
          ownerId: other.id,
          visibilityLevel: "owner",
        })
        .returning();
      if (!hidden) throw new Error("insert failed");

      const hiddenResult = await assertReferenceVisible(
        db,
        actor,
        { kind: "person", id: hidden.id },
        new AbortController().signal,
      );
      const missingResult = await assertReferenceVisible(
        db,
        actor,
        { kind: "person", id: crypto.randomUUID() },
        new AbortController().signal,
      );

      expect(hiddenResult.ok).toBe(false);
      expect(missingResult.ok).toBe(false);
      if (!hiddenResult.ok && !missingResult.ok) {
        expect(hiddenResult.error.id).toBe("E_CONTACT_001");
        expect(missingResult.error.id).toBe("E_CONTACT_001");
        // indistinguishable: same error id for hidden vs. missing
        expect(hiddenResult.error.id).toBe(missingResult.error.id);
      }
    });
  });

  it("passes for a person visible to all", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const actor: DealVisibilitySession = {
        userId: me.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [],
      };

      const [visible] = await db
        .insert(persons)
        .values({
          name: "Visible",
          ownerId: me.id,
          visibilityLevel: "all",
        })
        .returning();
      if (!visible) throw new Error("insert failed");

      const result = await assertReferenceVisible(
        db,
        actor,
        { kind: "person", id: visible.id },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
    });
  });

  // Codex finding F15: checkDeal loads the pipeline's visibility_group_id but never checks
  // is_archived. assertReferenceVisible gates collaboration reads/writes, activity creation,
  // and linking, so an archived-pipeline deal must be 404 here too (list/search/workspace
  // already hide it). An all-visibility deal isolates the archived-pipeline gate.
  it("returns 404 for a deal in an archived pipeline even when otherwise visible", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const actor: DealVisibilitySession = {
        userId: me.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [],
      };
      const archived = await seedPipelineWithStages(db, ["A"], { isArchived: true });
      const [deal] = await db
        .insert(deals)
        .values({
          title: "d",
          status: "open",
          pipelineId: archived.pipeline.id,
          stageId: archived.stages[0]!.id,
          boardPosition: "1000",
          ownerId: me.id,
          visibilityLevel: "all",
        })
        .returning();
      if (!deal) throw new Error("insert failed");

      const result = await assertReferenceVisible(
        db,
        actor,
        { kind: "deal", id: deal.id },
        new AbortController().signal,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.id).toBe("E_DEAL_001");
    });
  });

  it("passes for an owner-visibility person when actor is the owner", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const actor: DealVisibilitySession = {
        userId: me.id,
        isActive: true,
        sessionLive: true,
        isAdmin: false,
        visibilityGroupIds: [],
      };

      const [owned] = await db
        .insert(persons)
        .values({
          name: "OwnedByMe",
          ownerId: me.id,
          visibilityLevel: "owner",
        })
        .returning();
      if (!owned) throw new Error("insert failed");

      const result = await assertReferenceVisible(
        db,
        actor,
        { kind: "person", id: owned.id },
        new AbortController().signal,
      );
      expect(result.ok).toBe(true);
    });
  });
});
