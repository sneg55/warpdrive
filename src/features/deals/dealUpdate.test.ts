// dealUpdate.test.ts: field updates and won/lost transition tests.
// CAS + permissions + event tests live in dealUpdatePerms.test.ts.
// Audit change-log tests live in dealUpdate.changeLog.test.ts.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals, organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { createDef } from "@/features/custom-fields/defsRepo";
import { updateDeal } from "./dealActions";
import { adminSession, regularSession } from "./dealMove.test-helpers";
import { setupDeal } from "./dealUpdate.test-helpers";

describe("updateDeal: field updates", () => {
  it("owner updates title and value successfully", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "Updated Title",
          value: 5000,
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.title).toBe("Updated Title");
      expect(r.value.value).toBe("5000.00");
    });
  });

  it("validates deal custom fields against the active defs before persisting", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const signal = new AbortController().signal;
      const def = await createDef(
        db,
        { targetEntity: "deal", type: "numeric", name: "Budget" },
        signal,
      );
      if (def.ok === false) throw new Error("def seed failed");
      const key = def.value.key;

      // Valid value for the numeric def: persisted.
      const okRes = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          customFields: { [key]: 4200 },
        },
        signal,
      );
      expect(okRes.ok).toBe(true);
      if (okRes.ok === false) return;
      expect((okRes.value.customFields as Record<string, unknown>)[key]).toBe(4200);

      // Unknown key: rejected, nothing written.
      const unknown = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: okRes.value.updatedAt.toISOString(),
          customFields: { not_a_field: "x" },
        },
        signal,
      );
      expect(unknown.ok).toBe(false);
      if (unknown.ok === true) return;
      expect(unknown.error.id).toBe("E_CF_003");

      // Wrong type (string for a numeric def): rejected.
      const wrongType = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: okRes.value.updatedAt.toISOString(),
          customFields: { [key]: "not a number" },
        },
        signal,
      );
      expect(wrongType.ok).toBe(false);

      // The stored value is still the valid 4200 (no corruption from the rejected writes).
      const [row] = await db.select().from(deals).where(eq(deals.id, deal.id));
      expect((row?.customFields as Record<string, unknown>)[key]).toBe(4200);
    });
  });

  it("updates and clears the linked organization with the CAS precondition", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Target Org", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      expect(org).toBeDefined();
      if (org === undefined) return;

      const linked = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          orgId: org.id,
        },
        new AbortController().signal,
      );
      expect(linked.ok).toBe(true);
      if (linked.ok === false) return;
      expect(linked.value.orgId).toBe(org.id);

      const unlinked = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: linked.value.updatedAt.toISOString(),
          orgId: null,
        },
        new AbortController().signal,
      );
      expect(unlinked.ok).toBe(true);
      if (unlinked.ok === false) return;
      expect(unlinked.value.orgId).toBeNull();
    });
  });
});

describe("updateDeal: won/lost transitions", () => {
  it("status=won stamps wonTime and clears lostTime/lostReason", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          status: "won",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.status).toBe("won");
      expect(r.value.wonTime).not.toBeNull();
      expect(r.value.lostTime).toBeNull();
      expect(r.value.lostReason).toBeNull();
    });
  });

  it("status=lost without a reason succeeds with a null reason", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          status: "lost",
          // no lostReason: board drag-to-Lost supplies none, must still succeed.
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.status).toBe("lost");
      expect(r.value.lostTime).not.toBeNull();
      expect(r.value.lostReason).toBeNull();
    });
  });

  it("status=lost with a whitespace-only reason succeeds with a null reason", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          status: "lost",
          lostReason: "   ",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.status).toBe("lost");
      expect(r.value.lostTime).not.toBeNull();
      expect(r.value.lostReason).toBeNull();
    });
  });

  it("status=lost with a reason stamps lostTime and persists lostReason", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          status: "lost",
          lostReason: "No budget",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.status).toBe("lost");
      expect(r.value.lostTime).not.toBeNull();
      expect(r.value.lostReason).toBe("No budget");
      expect(r.value.wonTime).toBeNull();
    });
  });

  it("status=open clears wonTime, lostTime, and lostReason when reopening a won deal", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const won = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          status: "won",
        },
        new AbortController().signal,
      );
      expect(won.ok).toBe(true);
      if (won.ok === false) return;

      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: won.value.id,
          expectedUpdatedAt: won.value.updatedAt.toISOString(),
          status: "open",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.status).toBe("open");
      expect(r.value.wonTime).toBeNull();
      expect(r.value.lostTime).toBeNull();
      expect(r.value.lostReason).toBeNull();
    });
  });

  it("owner with deal.edit_own can update their own deal", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        regularSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "My Update",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.title).toBe("My Update");
    });
  });
});
