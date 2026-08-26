import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { activitiesByType } from "./activitiesByType";
import { seedActivityType, seedDeal, seedPipeline, seedUser, toActor } from "./statsTestHelpers";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

const BASE: DashboardFilters = {
  pipelineId: null,
  ownerScope: "all",
  from: "2025-01-01",
  to: "2025-12-31",
};

describe("activitiesByType", () => {
  it("counts completions per type by done time, and reports a type with none as zero", async () => {
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
        doneAt: new Date("2025-03-01T00:00:00Z"),
        dueAt: null,
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
      {
        typeId: call.id,
        subject: "c2",
        done: true,
        doneAt: new Date("2025-04-01T00:00:00Z"),
        dueAt: new Date("2024-01-01T00:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
      {
        typeId: call.id,
        subject: "not done",
        done: false,
        dueAt: new Date("2025-05-01T00:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
      },
    ]);

    const rows = await activitiesByType(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    const byId = new Map(rows.map((r) => [r.typeId, r]));
    // The second call was due in 2024 but done in 2025: completion date is what counts.
    expect(byId.get(call.id)?.completed).toBe(2);
    // A type nobody used still appears, so "no meetings booked" is visible rather than absent.
    expect(byId.get(lunch.id)?.completed).toBe(0);
  });

  it("excludes a completion outside the range", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const type = await seedActivityType(h, "Call");
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
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "next year",
      done: true,
      doneAt: new Date("2026-03-01T00:00:00Z"),
      dueAt: new Date("2025-03-01T00:00:00Z"),
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
    });

    const rows = await activitiesByType(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(rows.find((r) => r.typeId === type.id)?.completed).toBe(0);
  });

  it("SECURITY: a completion on an owner-only deal is invisible to a third party", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    const secret = await seedDeal(h, {
      title: "bob only",
      status: "open",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "owner",
    });
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "bob's call",
      done: true,
      doneAt: new Date("2025-03-01T00:00:00Z"),
      ownerId: bob.id,
      assigneeId: bob.id,
      dealId: secret.id,
    });

    const rows = await activitiesByType(
      h.db,
      toActor(alice),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(rows.find((r) => r.typeId === type.id)?.completed).toBe(0);
  });
});
