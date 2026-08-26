import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { Goal } from "@/db/schema/goals";
import {
  seedActivityType,
  seedDeal,
  seedPipeline,
  seedUser,
  toActor,
} from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { goalProgress } from "./goalProgress";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

async function seedGoal(values: Partial<typeof schema.goals.$inferInsert>): Promise<Goal> {
  const [g] = await h.db
    .insert(schema.goals)
    .values({
      subject: "deal",
      action: "won",
      metric: "value",
      assigneeKind: "company",
      interval: "monthly",
      target: "1000.00",
      startsOn: "2026-01-01",
      ...values,
    })
    .returning();
  if (g === undefined) throw new Error("no goal row");
  return g;
}

describe("goalProgress", () => {
  it("totals the value won by the assignee inside the current period", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    for (const [value, wonOn] of [
      ["400.00", "2026-03-05"],
      ["100.00", "2026-03-20"],
      // Won in the next period, so it must not inflate March.
      ["9999.00", "2026-04-02"],
    ] as const) {
      await seedDeal(h, {
        title: `won ${value}`,
        status: "won",
        value,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        wonTime: new Date(`${wonOn}T12:00:00Z`),
      });
    }
    const goal = await seedGoal({ pipelineId: pipeline.id, target: "1000.00" });

    const p = await goalProgress(
      h.db,
      toActor(user),
      goal,
      "2026-03-15",
      new AbortController().signal,
    );
    expect(p?.periodStart).toBe("2026-03-01");
    expect(p?.periodEnd).toBe("2026-03-31");
    expect(Number(p?.actual)).toBe(500);
    expect(p?.attainment).toBeCloseTo(0.5, 5);
  });

  it("counts only the named user's deals for a user goal", async () => {
    const alice = await seedUser(h, { isAdmin: true });
    const bob = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    for (const owner of [alice, bob]) {
      await seedDeal(h, {
        title: `won by ${owner.id}`,
        status: "won",
        value: "100.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "all",
        wonTime: new Date("2026-03-05T12:00:00Z"),
      });
    }
    const goal = await seedGoal({
      pipelineId: pipeline.id,
      assigneeKind: "user",
      assigneeId: alice.id,
      target: "100.00",
    });

    const p = await goalProgress(
      h.db,
      toActor(alice),
      goal,
      "2026-03-15",
      new AbortController().signal,
    );
    expect(Number(p?.actual)).toBe(100);
  });

  it("follows a team's current membership", async () => {
    const lead = await seedUser(h, { isAdmin: true });
    const member = await seedUser(h, { isAdmin: true });
    const outsider = await seedUser(h, { isAdmin: true });
    const [team] = await h.db
      .insert(schema.teams)
      .values({ name: `Team-${Date.now()}` })
      .returning();
    if (team === undefined) throw new Error("no team");
    await h.db.insert(schema.teamMembers).values([
      { teamId: team.id, userId: lead.id },
      { teamId: team.id, userId: member.id },
    ]);

    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    for (const owner of [lead, member, outsider]) {
      await seedDeal(h, {
        title: `won by ${owner.id}`,
        status: "won",
        value: "50.00",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: owner.id,
        visibilityLevel: "all",
        wonTime: new Date("2026-03-05T12:00:00Z"),
      });
    }
    const goal = await seedGoal({
      pipelineId: pipeline.id,
      assigneeKind: "team",
      assigneeId: team.id,
      target: "200.00",
    });

    const p = await goalProgress(
      h.db,
      toActor(lead),
      goal,
      "2026-03-15",
      new AbortController().signal,
    );
    expect(Number(p?.actual)).toBe(100);
  });

  it("counts completed activities of one type for an activity goal", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const call = await seedActivityType(h, "Call");
    const lunch = await seedActivityType(h, "Lunch");
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    const deal = await seedDeal(h, {
      title: "d",
      status: "open",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
    });
    await h.db.insert(schema.activities).values([
      {
        typeId: call.id,
        subject: "c1",
        done: true,
        doneAt: new Date("2026-03-05T12:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
      {
        typeId: lunch.id,
        subject: "l1",
        done: true,
        doneAt: new Date("2026-03-05T12:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
    ]);
    const goal = await seedGoal({
      pipelineId: pipeline.id,
      subject: "activity",
      action: "completed",
      metric: "count",
      activityTypeId: call.id,
      target: "10",
    });

    const p = await goalProgress(
      h.db,
      toActor(user),
      goal,
      "2026-03-15",
      new AbortController().signal,
    );
    expect(p?.actual).toBe("1");
  });

  it("is null before the goal has started", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const goal = await seedGoal({ startsOn: "2026-06-01" });
    const p = await goalProgress(
      h.db,
      toActor(user),
      goal,
      "2026-05-01",
      new AbortController().signal,
    );
    expect(p).toBeNull();
  });

  it("reports pace against how much of the period has gone", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "half the target",
      status: "won",
      value: "500.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      wonTime: new Date("2026-03-02T12:00:00Z"),
    });
    const goal = await seedGoal({ pipelineId: pipeline.id, target: "1000.00" });

    // Day 5 of 31: half the target booked on a sixth of the month is well ahead.
    const p = await goalProgress(
      h.db,
      toActor(user),
      goal,
      "2026-03-05",
      new AbortController().signal,
    );
    expect(p?.pace ?? 0).toBeGreaterThan(1);
  });

  it("SECURITY: a deal the viewer cannot see never reaches the goal total", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "bob only",
      status: "won",
      value: "7777.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "owner",
      wonTime: new Date("2026-03-05T12:00:00Z"),
    });
    const goal = await seedGoal({ pipelineId: pipeline.id, assigneeKind: "company" });

    const p = await goalProgress(
      h.db,
      toActor(alice),
      goal,
      "2026-03-15",
      new AbortController().signal,
    );
    expect(Number(p?.actual)).toBe(0);
  });
});
