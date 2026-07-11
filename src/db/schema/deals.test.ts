import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { dealFollowers } from "./dealFollowers";
import { dealParticipants } from "./dealParticipants";
import { deals } from "./deals";
import { users } from "./identity";
import { pipelines } from "./pipelines";
import { stages } from "./stages";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

async function seedUser(db: typeof h.db, suffix: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `u${suffix}@ex.com`, name: "Test User", googleSub: `sub-deals-${suffix}` })
    .returning();
  return u!;
}

async function seedPipelineWithStages(db: typeof h.db, stageNames: string[], label: string) {
  const [pipeline] = await db
    .insert(pipelines)
    .values({ name: `P-${label}` })
    .returning();
  const stageRows = await db
    .insert(stages)
    .values(stageNames.map((name, i) => ({ pipelineId: pipeline!.id, name, order: i })))
    .returning();
  return { pipeline: pipeline!, stages: stageRows };
}

describe("deals schema", () => {
  it("rejects a stage that belongs to a different pipeline (composite FK)", async () => {
    const u = await seedUser(h.db, `cfk-${Date.now()}`);
    const a = await seedPipelineWithStages(h.db, ["A1"], `cfk-a-${Date.now()}`);
    const b = await seedPipelineWithStages(h.db, ["B1"], `cfk-b-${Date.now()}`);
    await expect(
      h.db.insert(deals).values({
        title: "Cross-pipeline deal",
        pipelineId: a.pipeline.id,
        stageId: b.stages[0]!.id, // stage from pipeline B, deal assigned to pipeline A
        ownerId: u.id,
        visibilityLevel: "all",
      }),
    ).rejects.toThrow();
  });

  it("rejects a group-level deal with no visibility_group_id (CHECK)", async () => {
    const u = await seedUser(h.db, `grp-${Date.now()}`);
    const a = await seedPipelineWithStages(h.db, ["G1"], `grp-${Date.now()}`);
    await expect(
      h.db.insert(deals).values({
        title: "Group deal no group",
        pipelineId: a.pipeline.id,
        stageId: a.stages[0]!.id,
        ownerId: u.id,
        visibilityLevel: "group",
        visibilityGroupId: null,
      }),
    ).rejects.toThrow();
  });

  it("inserts a valid all-level deal", async () => {
    const u = await seedUser(h.db, `ok-${Date.now()}`);
    const a = await seedPipelineWithStages(h.db, ["S1"], `ok-${Date.now()}`);
    const [d] = await h.db
      .insert(deals)
      .values({
        title: "Acme renewal",
        pipelineId: a.pipeline.id,
        stageId: a.stages[0]!.id,
        ownerId: u.id,
        visibilityLevel: "all",
        value: "25000.00",
      })
      .returning();
    expect(d!.title).toBe("Acme renewal");
    expect(d!.status).toBe("open");
    expect(d!.value).toBe("25000.00");
  });

  it("cascades deal delete to deal_participants and deal_followers", async () => {
    const u = await seedUser(h.db, `casc-${Date.now()}`);
    const a = await seedPipelineWithStages(h.db, ["C1"], `casc-${Date.now()}`);
    const [d] = await h.db
      .insert(deals)
      .values({
        title: "Cascade deal",
        pipelineId: a.pipeline.id,
        stageId: a.stages[0]!.id,
        ownerId: u.id,
        visibilityLevel: "all",
      })
      .returning();

    // Add a follower
    await h.db.insert(dealFollowers).values({ dealId: d!.id, userId: u.id });

    // Add a participant (no FK to persons yet; insert raw uuid)
    const fakePersonId = "00000000-0000-0000-0000-000000000001";
    await h.db.insert(dealParticipants).values({ dealId: d!.id, personId: fakePersonId });

    // Delete the deal
    await h.db.delete(deals).where(sql`id = ${d!.id}`);

    const followers = await h.db.select().from(dealFollowers).where(sql`deal_id = ${d!.id}`);
    const participants = await h.db.select().from(dealParticipants).where(sql`deal_id = ${d!.id}`);

    expect(followers).toHaveLength(0);
    expect(participants).toHaveLength(0);
  });
});
