import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DealVisibilitySession } from "@/types/session";
import { dealVisibilityClause } from "./visibility";
import {
  openTestDb,
  seedPipeline,
  seedUser,
  seedVisibilityGroup,
  type TestDb,
} from "./visibility.test-helpers";

let h: TestDb;

beforeAll(async () => {
  h = await openTestDb();
});

afterAll(async () => {
  await h.close();
});

async function visibleIds(session: DealVisibilitySession): Promise<string[]> {
  const clause = dealVisibilityClause(session);
  const rows = await h.db.execute(
    sql`SELECT d.id::text AS id FROM deals d JOIN pipelines p ON p.id = d.pipeline_id WHERE ${clause} ORDER BY d.id`,
  );
  return (rows.rows as Array<{ id: string }>).map((r) => r.id);
}

describe("dealVisibilityClause (adapter delegating to dealVisibilityPredicate)", () => {
  it("owner-level deal: visible to owner, hidden from others", async () => {
    const owner = await seedUser(h);
    const viewer = await seedUser(h);
    const { pipeline, stage } = await seedPipeline(h);

    const [ownerDeal] = await h.db
      .insert(schema.deals)
      .values({
        title: "owner deal",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "owner",
      })
      .returning();
    if (!ownerDeal) throw new Error("insert failed");

    const [otherDeal] = await h.db
      .insert(schema.deals)
      .values({
        title: "other owner deal",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: viewer.id,
        visibilityLevel: "owner",
      })
      .returning();
    if (!otherDeal) throw new Error("insert failed");

    const ids = await visibleIds({
      userId: owner.id,
      isActive: true,
      sessionLive: true,
      isAdmin: false,
      visibilityGroupIds: [],
    });
    expect(ids).toContain(ownerDeal.id);
    expect(ids).not.toContain(otherDeal.id);
  });

  it("inactive viewer sees nothing", async () => {
    const owner = await seedUser(h);
    const { pipeline, stage } = await seedPipeline(h);
    await h.db.insert(schema.deals).values({
      title: "inactive test",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    });

    const ids = await visibleIds({
      userId: owner.id,
      isActive: false,
      sessionLive: true,
      isAdmin: true,
      visibilityGroupIds: [],
    });
    expect(ids).toHaveLength(0);
  });

  it("dead session sees nothing even for admin", async () => {
    const owner = await seedUser(h);
    const { pipeline, stage } = await seedPipeline(h);
    await h.db.insert(schema.deals).values({
      title: "dead session test",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    });

    const ids = await visibleIds({
      userId: owner.id,
      isActive: true,
      sessionLive: false,
      isAdmin: true,
      visibilityGroupIds: [],
    });
    expect(ids).toHaveLength(0);
  });

  it("admin sees all deals including owner-only and group-level", async () => {
    const owner = await seedUser(h);
    const { pipeline, stage } = await seedPipeline(h);
    const group = await seedVisibilityGroup(h, `admin-grp-${Date.now()}`);

    const [d1] = await h.db
      .insert(schema.deals)
      .values({
        title: "admin-a",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "owner",
      })
      .returning();
    const [d2] = await h.db
      .insert(schema.deals)
      .values({
        title: "admin-b",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "group",
        visibilityGroupId: group.id,
      })
      .returning();
    if (!d1 || !d2) throw new Error("insert failed");

    const admin = await seedUser(h, { isAdmin: true });
    const ids = await visibleIds({
      userId: admin.id,
      isActive: true,
      sessionLive: true,
      isAdmin: true,
      visibilityGroupIds: [],
    });
    expect(ids).toContain(d1.id);
    expect(ids).toContain(d2.id);
  });

  it("non-member denied deal in restricted pipeline", async () => {
    const pipelineGroup = await seedVisibilityGroup(h, `pipe-group-${Date.now()}`);
    const { pipeline, stage } = await seedPipeline(h, pipelineGroup.id);
    const owner = await seedUser(h);

    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "restricted pipeline deal",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "all",
      })
      .returning();
    if (!deal) throw new Error("insert failed");

    const ids = await visibleIds({
      userId: owner.id,
      isActive: true,
      sessionLive: true,
      isAdmin: false,
      visibilityGroupIds: [],
    });
    expect(ids).not.toContain(deal.id);
  });

  it("member of restricted pipeline group can see the deal", async () => {
    const pipelineGroup = await seedVisibilityGroup(h, `pipe-group2-${Date.now()}`);
    const { pipeline, stage } = await seedPipeline(h, pipelineGroup.id);
    const owner = await seedUser(h);

    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "member pipe group deal",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "all",
      })
      .returning();
    if (!deal) throw new Error("insert failed");

    const ids = await visibleIds({
      userId: owner.id,
      isActive: true,
      sessionLive: true,
      isAdmin: false,
      visibilityGroupIds: [pipelineGroup.id],
    });
    expect(ids).toContain(deal.id);
  });

  it("visible_to additive allow grants a non-owner access on owner-level deal", async () => {
    const owner = await seedUser(h);
    const stranger = await seedUser(h);
    const { pipeline, stage } = await seedPipeline(h);

    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "visible_to deal",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "owner",
        visibleToUserIds: [stranger.id],
      })
      .returning();
    if (!deal) throw new Error("insert failed");

    const ids = await visibleIds({
      userId: stranger.id,
      isActive: true,
      sessionLive: true,
      isAdmin: false,
      visibilityGroupIds: [],
    });
    expect(ids).toContain(deal.id);
  });

  it("group-level deal: visible to group member, hidden from non-member", async () => {
    const group = await seedVisibilityGroup(h, `deal-group-${Date.now()}`);
    const owner = await seedUser(h);
    const nonMember = await seedUser(h);
    const { pipeline, stage } = await seedPipeline(h);

    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "group deal",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "group",
        visibilityGroupId: group.id,
      })
      .returning();
    if (!deal) throw new Error("insert failed");

    const memberIds = await visibleIds({
      userId: owner.id,
      isActive: true,
      sessionLive: true,
      isAdmin: false,
      visibilityGroupIds: [group.id],
    });
    const nonMemberIds = await visibleIds({
      userId: nonMember.id,
      isActive: true,
      sessionLive: true,
      isAdmin: false,
      visibilityGroupIds: [],
    });

    expect(memberIds).toContain(deal.id);
    expect(nonMemberIds).not.toContain(deal.id);
  });
});
