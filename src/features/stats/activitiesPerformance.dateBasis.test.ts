import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { activitiesPerformance } from "./activitiesPerformance";
import { EVERYONE } from "./ownerIds";
import * as seed from "./statsTestHelpers";

let h: TestDb;

beforeAll(async () => {
  h = await makeTestDb();
});

afterAll(async () => {
  await h.close();
});

const toActor = seed.toActor;

function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  return seed.seedUser(h, overrides);
}

function seedActivityType() {
  return seed.seedActivityType(h);
}

async function seedPipeline() {
  const { pipeline, stages } = await seed.seedPipeline(h);
  const stage = stages[0];
  if (!stage) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedPipeline: no stage");
  return { pipeline, stage };
}

const BASE_FILTERS: DashboardFilters = {
  pipelineId: null,
  owners: EVERYONE,
  from: "2020-01-01",
  to: "2030-12-31",
  timeZone: "UTC",
};

describe("activitiesPerformance date basis", () => {
  const Y2025 = { from: "2025-01-01", to: "2025-12-31" };

  async function seedContext() {
    const user = await seedUser({ isAdmin: true });
    const type = await seedActivityType();
    const { pipeline, stage } = await seedPipeline();
    const [deal] = await h.db
      .insert(schema.deals)
      .values({
        title: "ctx deal",
        status: "open",
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (!deal) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "deal: no rows");
    return { user, type, pipeline, deal };
  }

  it("counts an activity completed inside the range that was due before it", async () => {
    const { user, type, pipeline, deal } = await seedContext();
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "overdue backlog, finally done",
      dueAt: new Date("2024-11-01T00:00:00Z"),
      done: true,
      doneAt: new Date("2025-03-01T00:00:00Z"),
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
    });

    const r = await activitiesPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.completed).toBe(1);
  });

  it("counts an activity completed inside the range that never had a due date", async () => {
    const { user, type, pipeline, deal } = await seedContext();
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "no due date, done anyway",
      dueAt: null,
      done: true,
      doneAt: new Date("2025-03-01T00:00:00Z"),
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
    });

    const r = await activitiesPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.completed).toBe(1);
  });

  it("excludes an activity completed after the range even though it was due inside it", async () => {
    const { user, type, pipeline, deal } = await seedContext();
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "done next year",
      dueAt: new Date("2025-12-01T00:00:00Z"),
      done: true,
      doneAt: new Date("2026-01-05T00:00:00Z"),
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
    });

    const r = await activitiesPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.completed).toBe(0);
  });

  it("reports open activities with no due date as undated instead of dropping them", async () => {
    const { user, type, pipeline, deal } = await seedContext();
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "someday",
      dueAt: null,
      ownerId: user.id,
      assigneeId: user.id,
      dealId: deal.id,
    });

    const r = await activitiesPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.undated).toBe(1);
    expect(r.scheduled).toBe(0);
  });

  it("counts activities added in the range by their creation date", async () => {
    const { user, type, pipeline, deal } = await seedContext();
    await h.db.insert(schema.activities).values([
      {
        typeId: type.id,
        subject: "created in range",
        dueAt: new Date("2030-01-01T00:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
        createdAt: new Date("2025-02-01T00:00:00Z"),
      },
      {
        typeId: type.id,
        subject: "created before range",
        dueAt: new Date("2030-01-01T00:00:00Z"),
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
        createdAt: new Date("2019-02-01T00:00:00Z"),
      },
    ]);

    const r = await activitiesPerformance(
      h.db,
      toActor(user),
      { ...BASE_FILTERS, ...Y2025, pipelineId: pipeline.id },
      new AbortController().signal,
    );
    expect(r.added).toBe(1);
  });
});
