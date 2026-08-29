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
import { goalSeries } from "./goalSeries";

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

const PERIOD = { start: "2026-03-01", end: "2026-03-31" };
const SIG = (): AbortSignal => new AbortController().signal;

describe("goalSeries", () => {
  it("runs a value goal's total forward day by day, holding flat where nothing was won", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    for (const [value, wonOn] of [
      ["400.00", "2026-03-02"],
      ["100.00", "2026-03-04"],
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
    const goal = await seedGoal({ pipelineId: pipeline.id });

    const series = await goalSeries(h.db, toActor(user), goal, PERIOD, "2026-03-05", SIG());

    expect(series.map((p) => p.day)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
    expect(series.map((p) => Number(p.actual))).toEqual([0, 400, 400, 500, 500]);
  });

  it("stops at the last day of the period once the period is over", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const goal = await seedGoal({});

    const series = await goalSeries(h.db, toActor(user), goal, PERIOD, "2026-05-01", SIG());

    expect(series).toHaveLength(31);
    expect(series.at(-1)?.day).toBe("2026-03-31");
  });

  it("counts completed activities of the goal's type as they are done", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const call = await seedActivityType(h, "Call");
    const other = await seedActivityType(h, "Lunch");
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
        doneAt: new Date("2026-03-02T12:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
      {
        typeId: call.id,
        subject: "c2",
        done: true,
        doneAt: new Date("2026-03-03T12:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
      {
        typeId: other.id,
        subject: "l1",
        done: true,
        doneAt: new Date("2026-03-03T12:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
    ]);
    const goal = await seedGoal({
      subject: "activity",
      action: "completed",
      metric: "count",
      activityTypeId: call.id,
      target: "10",
    });

    const series = await goalSeries(h.db, toActor(user), goal, PERIOD, "2026-03-04", SIG());

    expect(series.map((p) => Number(p.actual))).toEqual([0, 1, 2, 2]);
  });
});
