import { describe, expect, it } from "vitest";
import { visibilityGroupMembers, visibilityGroups } from "@/db/schema/identity";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";

// Deal-create authorization (permissions spec §5): deal.create is a global capability,
// AND the target pipeline must be unrestricted OR the actor must be a member of its
// visibility group. Neither gate existed before; a user could inject a deal into a
// restricted pipeline they cannot see by submitting a known/stale pipeline+stage UUID.

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

function regularNoCreate(userId: string) {
  return { ...regular(userId), flags: {} as Record<string, boolean> };
}

function firstStageId(p: Awaited<ReturnType<typeof seedPipelineWithStages>>): string {
  const s = p.stages[0];
  if (s === undefined) throw new Error("seedPipelineWithStages returned no stages");
  return s.id;
}

async function seedGroup(db: Parameters<typeof seedUser>[0]): Promise<string> {
  const [g] = await db
    .insert(visibilityGroups)
    .values({ name: `G-${Date.now()}-${Math.random().toString(36).slice(2)}` })
    .returning();
  if (g === undefined) throw new Error("seedGroup: insert returned no rows");
  return g.id;
}

async function seedDefaultSettings(db: Parameters<typeof seedUser>[0]): Promise<void> {
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
}

describe("createDeal authorization", () => {
  it("rejects a regular user without the deal.create capability", async () => {
    await withTestDb(async (db) => {
      await seedDefaultSettings(db);
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["S1"]);
      const r = await createDeal(
        db,
        regularNoCreate(u.id),
        { title: "No cap", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("rejects creating a deal into a restricted pipeline the user cannot see", async () => {
    await withTestDb(async (db) => {
      await seedDefaultSettings(db);
      const u = await seedUser(db);
      const groupId = await seedGroup(db);
      // Pipeline restricted to `groupId`; user u is NOT a member.
      const p = await seedPipelineWithStages(db, ["S1"], { visibilityGroupId: groupId });
      const r = await createDeal(
        db,
        regular(u.id),
        { title: "Sneaky", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("allows a member of the restricted pipeline's group to create a deal", async () => {
    await withTestDb(async (db) => {
      await seedDefaultSettings(db);
      const u = await seedUser(db);
      const groupId = await seedGroup(db);
      await db.insert(visibilityGroupMembers).values({ groupId, userId: u.id });
      const p = await seedPipelineWithStages(db, ["S1"], { visibilityGroupId: groupId });
      const session = { ...regular(u.id), visibilityGroupIds: [groupId] };
      const r = await createDeal(
        db,
        session,
        { title: "Member deal", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
    });
  });

  it("allows an admin to create a deal into a restricted pipeline", async () => {
    await withTestDb(async (db) => {
      await seedDefaultSettings(db);
      const u = await seedUser(db, { isAdmin: true });
      const groupId = await seedGroup(db);
      const p = await seedPipelineWithStages(db, ["S1"], { visibilityGroupId: groupId });
      const session = { ...regular(u.id), isAdmin: true };
      const r = await createDeal(
        db,
        session,
        { title: "Admin deal", pipelineId: p.pipeline.id, stageId: firstStageId(p) },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
    });
  });
});
