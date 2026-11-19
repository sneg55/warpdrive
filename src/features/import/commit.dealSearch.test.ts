import { afterEach, describe, expect, it } from "vitest";
import { importBatches, importRows } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import {
  captureDealSearchQueue,
  linkedDeal,
} from "@/features/intercom/dealSearch/dealSearch.test-helpers";
import { seedWorld } from "@/features/search/search.test-helpers";
import { commitRow, type ImportActor } from "./commit";

const releases: Array<() => void> = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
});

function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedRow(
  db: TestDb,
  userId: string,
  target: "person" | "deal",
  mapped: Record<string, unknown>,
) {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: target, filename: "f.csv", createdBy: userId })
    .returning();
  const [row] = await db
    .insert(importRows)
    .values({
      batchId: batch?.id ?? "",
      rowNumber: 1,
      raw: {},
      mapped: { primary: mapped },
      status: "valid",
    })
    .returning();
  return row?.id ?? "";
}

describe("CSV import commit queues a deal search refresh", () => {
  it("queues the deals of an existing person updated with new emails", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w, "upd@a.com");
      const q = captureDealSearchQueue();
      releases.push(q.release);
      const rowId = await seedRow(db, user.id, "person", {
        name: "New Name",
        emails: [{ label: "work", value: "upd@a.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      });
      const r = await commitRow(
        db,
        adminActorFor(user.id),
        rowId,
        "person",
        "update",
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      expect(q.queued()).toEqual([a.dealId]);
    });
  });

  it("queues a deal imported with a linked person", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w, "p@a.com");
      const pipe = await seedPipelineWithStages(db, ["Qualified"]);
      const q = captureDealSearchQueue();
      releases.push(q.release);
      const [batch] = await db
        .insert(importBatches)
        .values({ targetEntity: "deal", filename: "d.csv", createdBy: user.id })
        .returning();
      const [row] = await db
        .insert(importRows)
        .values({
          batchId: batch?.id ?? "",
          rowNumber: 1,
          raw: {},
          mapped: {
            primary: {
              title: "Imported",
              value: null,
              expectedCloseDate: null,
              pipeline: pipe.pipeline.name,
              stage: pipe.stages[0]?.name,
            },
            person: { name: "Maya", emails: [{ label: "work", value: "p@a.com", primary: true }] },
          },
          status: "valid",
        })
        .returning();
      const r = await commitRow(
        db,
        adminActorFor(user.id),
        row?.id ?? "",
        "deal",
        "skip",
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      expect(q.queued()).toHaveLength(1);
      expect(q.queued()).not.toContain(a.dealId);
    });
  });
});
