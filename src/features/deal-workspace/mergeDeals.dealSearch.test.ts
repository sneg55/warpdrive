import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import {
  addParticipantRow,
  captureDealSearchQueue,
  linkedDeal,
} from "@/features/intercom/dealSearch/dealSearch.test-helpers";
import { seedWorld } from "@/features/search/search.test-helpers";
import { mergeDeals } from "./mergeDeals";

const afterEachRelease: Array<() => void> = [];
afterEach(() => {
  for (const release of afterEachRelease.splice(0)) release();
});

describe("deal merge", () => {
  it("queues the target deal, which now holds the source's participants", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const target = await linkedDeal(db, w, "t@acme.com");
      const source = await linkedDeal(db, w, "s@acme.com");
      await addParticipantRow(db, source.dealId, source.personId);
      const [t] = await db.select().from(deals).where(eq(deals.id, target.dealId));
      const [s] = await db.select().from(deals).where(eq(deals.id, source.dealId));
      const q = captureDealSearchQueue();
      afterEachRelease.push(q.release);
      const r = await mergeDeals(
        db,
        { id: w.alice.id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() },
        {
          targetDealId: target.dealId,
          sourceDealId: source.dealId,
          expectedTargetUpdatedAt: t?.updatedAt.toISOString(),
          expectedSourceUpdatedAt: s?.updatedAt.toISOString(),
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      expect(q.queued()).toEqual([target.dealId]);
    });
  });
});
