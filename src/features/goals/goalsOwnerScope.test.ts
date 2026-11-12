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
import type { OwnerScope } from "@/types/stats";
import { goalProgress } from "./goalProgress";
import { goalSeries } from "./goalSeries";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

const ON = "2026-03-15";
const PERIOD = { start: "2026-03-01", end: "2026-03-31" };
const ALL: OwnerScope = { kind: "all" };
const SIG = (): AbortSignal => new AbortController().signal;

async function seedGoal(values: Partial<typeof schema.goals.$inferInsert>): Promise<Goal> {
  const [g] = await h.db
    .insert(schema.goals)
    .values({
      subject: "activity",
      action: "completed",
      metric: "count",
      assigneeKind: "company",
      interval: "monthly",
      target: "10",
      startsOn: "2026-01-01",
      ...values,
    })
    .returning();
  if (g === undefined) throw new Error("no goal row");
  return g;
}

async function seedTeam(memberIds: string[]) {
  const [team] = await h.db
    .insert(schema.teams)
    .values({ name: `T-${Date.now()}-${Math.random()}` })
    .returning();
  if (team === undefined) throw new Error("no team");
  for (const userId of memberIds)
    await h.db.insert(schema.teamMembers).values({ teamId: team.id, userId });
  return team;
}

async function world() {
  const admin = await seedUser(h, { isAdmin: true });
  const martin = await seedUser(h);
  const nick = await seedUser(h);
  const outsider = await seedUser(h);
  const team = await seedTeam([martin.id, nick.id]);
  return { admin, martin, nick, outsider, team };
}

type World = Awaited<ReturnType<typeof world>>;

async function seedCompleted(assigneeId: string, typeId: string, doneOn: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    await h.db.insert(schema.activities).values({
      typeId,
      subject: `done-${i}`,
      done: true,
      doneAt: new Date(`${doneOn}T12:00:00Z`),
      ownerId: assigneeId,
      assigneeId,
    });
  }
}

async function activityWorld() {
  const w = await world();
  const type = await seedActivityType(h);
  await seedCompleted(w.martin.id, type.id, "2026-03-05", 3);
  await seedCompleted(w.nick.id, type.id, "2026-03-06", 2);
  await seedCompleted(w.outsider.id, type.id, "2026-03-07", 4);
  const goal = await seedGoal({ activityTypeId: type.id });
  return { ...w, goal };
}

async function actualFor(w: World, goal: Goal, scope: OwnerScope) {
  const p = await goalProgress(h.db, toActor(w.admin), goal, ON, scope, SIG());
  return p?.actual;
}

async function lastPoint(w: World, goal: Goal, scope: OwnerScope) {
  const series = await goalSeries(h.db, toActor(w.admin), goal, PERIOD, ON, scope, SIG());
  return series.at(-1)?.actual;
}

describe("a company goal under the dashboard's owner picker", () => {
  it("counts only the picked person's completed activities", async () => {
    const w = await activityWorld();
    const scope: OwnerScope = { kind: "user", userId: w.martin.id };
    expect(await actualFor(w, w.goal, scope)).toBe("3");
    expect(await lastPoint(w, w.goal, scope)).toBe("3");
  });

  it("counts only the viewer's own activities for the me scope", async () => {
    const w = await activityWorld();
    const type = await seedActivityType(h);
    await seedCompleted(w.admin.id, type.id, "2026-03-08", 1);
    await seedCompleted(w.martin.id, type.id, "2026-03-08", 2);
    const goal = await seedGoal({ activityTypeId: type.id });
    expect(await actualFor(w, goal, { kind: "me" })).toBe("1");
    expect(await lastPoint(w, goal, { kind: "me" })).toBe("1");
  });

  it("counts only the members of the picked team", async () => {
    const w = await activityWorld();
    const scope: OwnerScope = { kind: "team", teamId: w.team.id };
    expect(await actualFor(w, w.goal, scope)).toBe("5");
    expect(await lastPoint(w, w.goal, scope)).toBe("5");
  });

  it("counts the whole company when everyone is picked", async () => {
    const w = await activityWorld();
    expect(await actualFor(w, w.goal, ALL)).toBe("9");
    expect(await lastPoint(w, w.goal, ALL)).toBe("9");
  });

  it("keeps a user-assigned goal at its assignee's figure for that person's view", async () => {
    const w = await activityWorld();
    const goal = await seedGoal({
      activityTypeId: w.goal.activityTypeId,
      assigneeKind: "user",
      assigneeId: w.martin.id,
    });
    const scope: OwnerScope = { kind: "user", userId: w.martin.id };
    expect(await actualFor(w, goal, scope)).toBe("3");
    expect(await actualFor(w, goal, ALL)).toBe("3");
  });

  it("keeps attainment on the narrowed figure against the same target", async () => {
    const w = await activityWorld();
    const scope: OwnerScope = { kind: "user", userId: w.martin.id };
    const p = await goalProgress(h.db, toActor(w.admin), w.goal, ON, scope, SIG());
    expect(p?.target).toBe("10.00");
    expect(p?.attainment).toBeCloseTo(0.3);
  });
});

async function dealWorld() {
  const w = await world();
  const { pipeline, stages } = await seedPipeline(h);
  const stage = stages[0];
  if (stage === undefined) throw new Error("no stage");
  for (const [owner, value, wonOn] of [
    [w.martin.id, "400.00", "2026-03-05"],
    [w.martin.id, "100.00", "2026-03-06"],
    [w.nick.id, "50.00", "2026-03-07"],
    [w.outsider.id, "1000.00", "2026-03-08"],
  ] as const) {
    await seedDeal(h, {
      title: `won ${value}`,
      status: "won",
      value,
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: owner,
      visibilityLevel: "all",
      wonTime: new Date(`${wonOn}T12:00:00Z`),
    });
  }
  return { ...w, pipeline };
}

describe("a company deal goal under the dashboard's owner picker", () => {
  it("counts only the picked person's won deals", async () => {
    const w = await dealWorld();
    const goal = await seedGoal({
      subject: "deal",
      action: "won",
      metric: "count",
      pipelineId: w.pipeline.id,
    });
    const scope: OwnerScope = { kind: "user", userId: w.martin.id };
    expect(await actualFor(w, goal, scope)).toBe("2");
    expect(await lastPoint(w, goal, scope)).toBe("2");
  });

  it("sums only the picked person's deal value", async () => {
    const w = await dealWorld();
    const goal = await seedGoal({
      subject: "deal",
      action: "won",
      metric: "value",
      target: "1000.00",
      pipelineId: w.pipeline.id,
    });
    const scope: OwnerScope = { kind: "user", userId: w.martin.id };
    expect(await actualFor(w, goal, scope)).toBe("500.00");
    expect(await lastPoint(w, goal, scope)).toBe("500.00");
  });

  it("sums only the picked team's deal value, and everyone's for the whole company", async () => {
    const w = await dealWorld();
    const goal = await seedGoal({
      subject: "deal",
      action: "won",
      metric: "value",
      target: "1000.00",
      pipelineId: w.pipeline.id,
    });
    expect(await actualFor(w, goal, { kind: "team", teamId: w.team.id })).toBe("550.00");
    expect(await actualFor(w, goal, ALL)).toBe("1550.00");
    expect(await lastPoint(w, goal, ALL)).toBe("1550.00");
  });
});
