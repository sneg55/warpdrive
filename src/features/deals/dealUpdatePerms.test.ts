// dealUpdatePerms.test.ts: CAS precondition, permissions, and realtime event for updateDeal.
// Field update and won/lost transition tests live in dealUpdate.test.ts.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { channelVersions } from "@/db/schema/realtime";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { updateDeal } from "./dealActions";
import { adminSession, noEditSession, regularSession } from "./dealMove.test-helpers";
import { setupDeal } from "./dealUpdate.test-helpers";

describe("updateDeal: CAS precondition", () => {
  it("returns E_DEAL_002 on stale expectedUpdatedAt and leaves row unchanged", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
          title: "Should Not Change",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_DEAL_002");

      // Confirm the deal was NOT modified (CAS atomicity: single UPDATE WHERE).
      const unchanged = await db.select().from(deals).where(eq(deals.id, deal.id));
      expect(unchanged[0]?.title).toBe("Initial");
    });
  });
});

describe("updateDeal: permissions", () => {
  it("denies a user with no deal.edit_* flag (E_PERM_001)", async () => {
    await withTestDb(async (db) => {
      const { deal } = await setupDeal(db);
      const other = await seedUser(db);
      const r = await updateDeal(
        db,
        noEditSession(other.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "Hijack",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("denies a non-owner with only deal.edit_own (E_PERM_001)", async () => {
    await withTestDb(async (db) => {
      const { deal } = await setupDeal(db);
      const other = await seedUser(db);
      const r = await updateDeal(
        db,
        regularSession(other.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "Hijack",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });
});

describe("updateDeal: realtime event", () => {
  it("emits deal_updated event on deal:{id} channel in the same transaction", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const channel = `deal:${deal.id}`;

      const beforeRows = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      const versionBefore = Number(beforeRows[0]?.version ?? 0);

      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "Event Test",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);

      const afterRows = await db
        .select()
        .from(channelVersions)
        .where(eq(channelVersions.channel, channel));
      const versionAfter = Number(afterRows[0]?.version ?? 0);
      expect(versionAfter).toBeGreaterThan(versionBefore);
    });
  });
});
