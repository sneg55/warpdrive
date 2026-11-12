import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { ImportSource } from "@/constants/importSources";
import { deals, importRows } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { EVERYONE } from "@/features/stats/ownerIds";
import { wonDealStats } from "@/features/stats/wonDealStats";
import { commitRow } from "./commit";
import { adminActorFor, seedBatchWithRows, type TestDb } from "./pipedriveImport.testHelpers";

const signal = new AbortController().signal;

async function importDeal(db: TestDb, source: ImportSource, extra: Record<string, unknown>) {
  const user = await seedUser(db);
  const actor = adminActorFor(user.id);
  const p = await seedPipelineWithStages(db, ["Qualified"]);
  const { rowIds } = await seedBatchWithRows(db, user.id, {
    source,
    target: "deal",
    rows: [
      {
        primary: {
          title: "Historic",
          value: 100,
          expectedCloseDate: null,
          pipeline: p.pipeline.name,
          stage: null,
          customFields: {},
          ...extra,
        },
      },
    ],
  });
  const rowId = rowIds[0];
  if (rowId === undefined) throw new Error("no row");
  const outcome = await commitRow(db, actor, rowId, "deal", "skip", signal);
  const [deal] = await db.select().from(deals);
  const [row] = await db.select().from(importRows).where(eq(importRows.id, rowId));
  return { outcome, deal, row, actor };
}

it("imports a won Pipedrive deal with its own timestamps and labels", async () => {
  await withTestDb(async (db) => {
    const { outcome, deal, row } = await importDeal(db, "pipedrive", {
      status: "won",
      wonTime: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      labels: ["Hot", "Q1"],
    });
    expect(outcome.ok && outcome.value.status).toBe("imported");
    expect(deal?.status).toBe("won");
    expect(deal?.wonTime).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(deal?.createdAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(deal?.stageEnteredAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(deal?.labels).toEqual(["Hot", "Q1"]);
    expect(row?.warnings).toEqual([]);
  });
});

it("imports a lost Pipedrive deal with its time and reason", async () => {
  await withTestDb(async (db) => {
    const { deal } = await importDeal(db, "pipedrive", {
      status: "lost",
      lostTime: "2026-02-01T00:00:00.000Z",
      lostReason: "No budget",
    });
    expect(deal?.status).toBe("lost");
    expect(deal?.lostTime).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(deal?.lostReason).toBe("No budget");
    expect(deal?.wonTime).toBeNull();
  });
});

it("stores an inferred won time as a warning on an imported row", async () => {
  await withTestDb(async (db) => {
    const { outcome, deal, row } = await importDeal(db, "pipedrive", {
      status: "won",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(outcome.ok && outcome.value.status).toBe("imported");
    expect(deal?.wonTime).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(row?.status).toBe("imported");
    expect(row?.warnings).toEqual([{ field: "wonTime", message: expect.any(String) }]);
  });
});

it("counts an imported won deal with a creation date in the sales cycle", async () => {
  await withTestDb(async (db) => {
    const { actor } = await importDeal(db, "pipedrive", {
      status: "won",
      wonTime: "2026-01-11T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const stats = await wonDealStats(
      db,
      actor,
      {
        pipelineId: null,
        owners: EVERYONE,
        from: "2026-01-01",
        to: "2026-12-31",
        timeZone: "UTC",
      },
      signal,
    );
    expect(stats.avgCycleDays).toBe(10);
  });
});

it("ignores history fields on a generic CSV batch", async () => {
  await withTestDb(async (db) => {
    const { deal } = await importDeal(db, "csv", {
      status: "won",
      wonTime: "2026-03-01T00:00:00.000Z",
    });
    expect(deal?.status).toBe("open");
    expect(deal?.wonTime).toBeNull();
  });
});
