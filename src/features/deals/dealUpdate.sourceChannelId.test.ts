// Integration test for the free-text Channel ID (deals.source_channel_id) becoming editable via
// updateDeal. Split out of dealUpdate.test.ts to keep that file under the size cap.
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { updateDeal } from "./dealActions";
import { adminSession } from "./dealMove.test-helpers";
import { setupDeal } from "./dealUpdate.test-helpers";

describe("updateDeal: source_channel_id", () => {
  it("owner sets and clears the free-text Channel ID with the CAS precondition", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const set = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          sourceChannelId: "EXT-42",
        },
        new AbortController().signal,
      );
      expect(set.ok).toBe(true);
      if (set.ok === false) return;
      expect(set.value.sourceChannelId).toBe("EXT-42");

      const cleared = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: set.value.updatedAt.toISOString(),
          sourceChannelId: null,
        },
        new AbortController().signal,
      );
      expect(cleared.ok).toBe(true);
      if (cleared.ok === false) return;
      expect(cleared.value.sourceChannelId).toBeNull();
    });
  });
});
