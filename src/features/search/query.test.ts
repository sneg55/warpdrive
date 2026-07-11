import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { searchAll } from "./query";

function makeActor(
  id: string,
  type: "admin" | "regular" = "regular",
  groupIds: Set<string> = new Set(),
): PermSetUser {
  return { id, type, isActive: true, flags: new Set(), groupIds };
}

describe("searchAll", () => {
  it("finds an all-visible deal but excludes an owner-only deal owned by another user", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      const { pipeline, stages } = await seedPipelineWithStages(db, ["Discovery"]);
      const stage = stages[0]!;

      await db.insert(schema.deals).values({
        title: "Acme renewal",
        ownerId: alice.id,
        visibilityLevel: "all",
        pipelineId: pipeline.id,
        stageId: stage.id,
      });
      await db.insert(schema.deals).values({
        title: "Acme secret",
        ownerId: bob.id,
        visibilityLevel: "owner",
        pipelineId: pipeline.id,
        stageId: stage.id,
      });

      const aliceActor = makeActor(alice.id);
      const r = await searchAll(db, aliceActor, "Acme", signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error(r.error.message);
      const titles = r.value.deals.map((d) => d.primary);
      expect(titles).toContain("Acme renewal");
      expect(titles).not.toContain("Acme secret");
    });
  });

  it("finds an all-visible person but excludes an owner-only person owned by another user", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      const charlie = await seedUser(db);

      await db.insert(schema.persons).values({
        name: "Zephyr Bright",
        ownerId: alice.id,
        visibilityLevel: "all",
      });
      await db.insert(schema.persons).values({
        name: "Zephyr Shadow",
        ownerId: bob.id,
        visibilityLevel: "owner",
      });

      // charlie is a third party: should see the 'all' person, not bob's 'owner' person
      const charlieActor = makeActor(charlie.id);
      const r = await searchAll(db, charlieActor, "Zephyr", signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error(r.error.message);
      const names = r.value.people.map((p) => p.primary);
      expect(names).toContain("Zephyr Bright");
      expect(names).not.toContain("Zephyr Shadow");
    });
  });

  it("finds an all-visible org but excludes an owner-only org owned by another user", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      const charlie = await seedUser(db);

      await db.insert(schema.organizations).values({
        name: "Quasar Corp",
        ownerId: alice.id,
        visibilityLevel: "all",
      });
      await db.insert(schema.organizations).values({
        name: "Quasar Hidden",
        ownerId: bob.id,
        visibilityLevel: "owner",
      });

      const charlieActor = makeActor(charlie.id);
      const r = await searchAll(db, charlieActor, "Quasar", signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error(r.error.message);
      const names = r.value.organizations.map((o) => o.primary);
      expect(names).toContain("Quasar Corp");
      expect(names).not.toContain("Quasar Hidden");
    });
  });

  it("excludes a deal in a restricted pipeline whose group the actor is NOT in", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const outsider = await seedUser(db);

      // Create a visibility group; outsider is NOT a member.
      const [grp] = await db
        .insert(schema.visibilityGroups)
        .values({ name: "RestrictedGroup" })
        .returning();
      const group = grp!;

      // Pipeline restricted to the group.
      const { pipeline, stages } = await seedPipelineWithStages(db, ["Proposal"], {
        visibilityGroupId: group.id,
      });
      const stage = stages[0]!;

      // Deal itself is all-visible but the pipeline is restricted (should be hidden).
      await db.insert(schema.deals).values({
        title: "Nebula Restricted Deal",
        ownerId: owner.id,
        visibilityLevel: "all",
        pipelineId: pipeline.id,
        stageId: stage.id,
      });

      // Present control: an all-visible deal in a NON-restricted pipeline matching
      // the same query term. Proves the pipeline gate (not an empty result set)
      // is what excludes the restricted deal.
      const { pipeline: openPipeline, stages: openStages } = await seedPipelineWithStages(db, [
        "Discovery",
      ]);
      const openStage = openStages[0]!;
      await db.insert(schema.deals).values({
        title: "Nebula Open Deal",
        ownerId: owner.id,
        visibilityLevel: "all",
        pipelineId: openPipeline.id,
        stageId: openStage.id,
      });

      const outsiderActor = makeActor(outsider.id);
      const r = await searchAll(db, outsiderActor, "Nebula", signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error(r.error.message);
      const titles = r.value.deals.map((d) => d.primary);
      expect(titles).toContain("Nebula Open Deal");
      expect(titles).not.toContain("Nebula Restricted Deal");
    });
  });

  it("rejects a blank query with E_SEARCH_001", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const alice = await seedUser(db);
      const aliceActor = makeActor(alice.id);
      const r = await searchAll(db, aliceActor, "   ", signal);
      expect(r.ok).toBe(false);
      if (r.ok === true) throw new Error("expected err");
      expect(r.error.id).toBe(ERROR_IDS.SEARCH_EMPTY_QUERY);
    });
  });

  it("finds an all-visible lead but excludes an owner-only lead owned by another user", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      const charlie = await seedUser(db);

      await db.insert(schema.leads).values({
        title: "Zephyr expansion",
        ownerId: alice.id,
        visibilityLevel: "all",
      });
      await db.insert(schema.leads).values({
        title: "Zephyr hidden",
        ownerId: bob.id,
        visibilityLevel: "owner",
      });

      const charlieActor = makeActor(charlie.id);
      const r = await searchAll(db, charlieActor, "Zephyr", signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error(r.error.message);
      const titles = r.value.leads.map((l) => l.primary);
      expect(titles).toContain("Zephyr expansion");
      expect(titles).not.toContain("Zephyr hidden");
    });
  });

  // F7: an all-visible deal in an ARCHIVED pipeline must not surface in search.
  it("excludes a deal in an archived pipeline from search results", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const alice = await seedUser(db);
      const { pipeline, stages } = await seedPipelineWithStages(db, ["Discovery"], {
        isArchived: true,
      });
      const stage = stages[0]!;
      await db.insert(schema.deals).values({
        title: "Archived Acme",
        ownerId: alice.id,
        visibilityLevel: "all",
        pipelineId: pipeline.id,
        stageId: stage.id,
      });
      const r = await searchAll(db, makeActor(alice.id), "Acme", signal);
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error(r.error.message);
      expect(r.value.deals.length).toBe(0);
    });
  });
});
