import { expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { resolveStageChangeNames } from "@/features/deal-workspace/history/stageNames";
import { listChangeLog, recordChange } from "./changeLog";

async function seedDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
): Promise<{ id: string }> {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const stage = pipe.stages[0];
  if (stage === undefined) throw new Error("stage seed failed");
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: stage.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  return deal;
}

it("appends a change log entry and lists newest first", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const deal = await seedDeal(db, user.id);

    await db.transaction(async (tx) => {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: deal.id,
          field: "value",
          oldValue: 1000,
          newValue: 2000,
          actorId: user.id,
        },
        signal,
      );
    });

    const log = await listChangeLog(db, "deal", deal.id, signal);
    expect(log[0]?.field).toBe("value");
    expect(log[0]?.newValue).toBe(2000);
  });
});

// Regression: node-postgres already JSON.parses jsonb columns, and drizzle's
// PgJsonb.mapFromDriverValue re-parses any string it receives. Without reading
// the jsonb columns as text (see listChangeLog), a numeric-looking STRING like
// a deal's "2000.00" would come back as the number 2000, losing precision.
it("round-trips a numeric-looking jsonb string without collapsing it to a number", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const deal = await seedDeal(db, user.id);

    await db.transaction(async (tx) => {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: deal.id,
          field: "value",
          oldValue: null,
          newValue: "2000.00",
          actorId: user.id,
        },
        signal,
      );
    });

    const log = await listChangeLog(db, "deal", deal.id, signal);
    expect(log[0]?.oldValue).toBeNull();
    expect(log[0]?.newValue).toBe("2000.00");
  });
});

it("resolves the actor display name via the users join", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Nick Sawinyh" });
    const deal = await seedDeal(db, user.id);

    await db.transaction(async (tx) => {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: deal.id,
          field: "value",
          oldValue: 1,
          newValue: 2,
          actorId: user.id,
        },
        signal,
      );
    });

    const log = await listChangeLog(db, "deal", deal.id, signal);
    expect(log[0]?.actorName).toBe("Nick Sawinyh");
  });
});

it("returns a null actorName when the change has no actor", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const deal = await seedDeal(db, user.id);

    await db.transaction(async (tx) => {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: deal.id,
          field: "value",
          oldValue: 1,
          newValue: 2,
          actorId: null,
        },
        signal,
      );
    });

    const log = await listChangeLog(db, "deal", deal.id, signal);
    expect(log[0]?.actorName).toBeNull();
  });
});

it("resolves stageId change old/new ids to stage names in the read layer", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const pipe = await seedPipelineWithStages(db, ["Demo", "Proposal"]);
    const [demo, proposal] = pipe.stages;
    if (demo === undefined || proposal === undefined) throw new Error("stage seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: demo.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");

    // Mirrors what changeStage writes: field "stageId", ids in old/new.
    await db.transaction(async (tx) => {
      await recordChange(
        tx,
        {
          entityType: "deal",
          entityId: deal.id,
          field: "stageId",
          oldValue: demo.id,
          newValue: proposal.id,
          actorId: user.id,
        },
        signal,
      );
    });

    const log = await listChangeLog(db, "deal", deal.id, signal);
    const stageNameById = new Map(pipe.stages.map((s) => [s.id, s.name]));
    const resolved = resolveStageChangeNames(log, stageNameById);
    expect(resolved[0]?.oldValue).toBe("Demo");
    expect(resolved[0]?.newValue).toBe("Proposal");
  });
});
