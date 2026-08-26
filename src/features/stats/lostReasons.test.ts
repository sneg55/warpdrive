import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { lostReasonBreakdown } from "./lostReasons";
import { seedDeal, seedPipeline, seedUser, toActor } from "./statsTestHelpers";

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

async function seedReason(name: string) {
  const [r] = await h.db.insert(schema.lostReasons).values({ name }).returning();
  if (r === undefined) throw new Error("no reason row");
  return r;
}

describe("lostReasonBreakdown", () => {
  it("groups lost deals by their selected reason, with count and value", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    const price = await seedReason(`Price-${Date.now()}`);

    for (const value of ["100.00", "300.00"]) {
      await seedDeal(h, {
        title: `lost ${value}`,
        status: "lost",
        value,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
        lostTime: new Date("2025-05-01T00:00:00Z"),
        lostReasonId: price.id,
      });
    }

    const rows = await lostReasonBreakdown(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    const row = rows.find((r) => r.reasonId === price.id);
    expect(row?.count).toBe(2);
    expect(Number(row?.value)).toBe(400);
    expect(row?.name).toBe(price.name);
  });

  it("keeps deals lost with no reason in their own bucket rather than dropping them", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "lost, no reason given",
      status: "lost",
      value: "50.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      lostTime: new Date("2025-05-01T00:00:00Z"),
    });

    const rows = await lostReasonBreakdown(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    const unspecified = rows.find((r) => r.reasonId === null);
    expect(unspecified?.count).toBe(1);
    expect(unspecified?.name).toBeNull();
  });

  it("falls back to the free-text reason when no reason row was selected", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "lost with typed reason",
      status: "lost",
      value: "70.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      lostTime: new Date("2025-05-01T00:00:00Z"),
      lostReason: "Went with a competitor",
    });

    const rows = await lostReasonBreakdown(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(rows.find((r) => r.name === "Went with a competitor")?.count).toBe(1);
  });

  it("windows on lost time", async () => {
    const user = await seedUser(h, { isAdmin: true });
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "lost next year",
      status: "lost",
      value: "9.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
      lostTime: new Date("2026-05-01T00:00:00Z"),
    });

    const rows = await lostReasonBreakdown(
      h.db,
      toActor(user),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(rows).toHaveLength(0);
  });

  it("SECURITY: an owner-only lost deal is invisible to a third party", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const { pipeline, stages } = await seedPipeline(h);
    const stage = stages[0];
    if (stage === undefined) throw new Error("no stage");
    await seedDeal(h, {
      title: "bob's loss",
      status: "lost",
      value: "4000.00",
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: bob.id,
      visibilityLevel: "owner",
      lostTime: new Date("2025-05-01T00:00:00Z"),
    });

    const rows = await lostReasonBreakdown(
      h.db,
      toActor(alice),
      { ...BASE, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(rows).toHaveLength(0);
  });
});
