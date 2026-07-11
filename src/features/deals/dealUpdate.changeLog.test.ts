// dealUpdate.changeLog.test.ts: audit change-log rows written inside updateDeal's
// transaction. Split out of dealUpdate.test.ts to keep both files under the size limit.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listChangeLog } from "@/features/collaboration/changeLog";
import { updateDeal } from "./dealActions";
import { adminSession, regularSession } from "./dealMove.test-helpers";
import { setupDeal } from "./dealUpdate.test-helpers";

describe("updateDeal: audit change logs", () => {
  it("records a labels change when labels are provided and differ", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          labels: ["hot"],
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      const labelChange = log.find((c) => c.field === "labels");
      expect(labelChange).toBeDefined();
      expect(labelChange?.oldValue).toEqual([]);
      expect(labelChange?.newValue).toEqual(["hot"]);
      expect(labelChange?.actorId).toBe(u.id);
    });
  });

  it("does NOT record a labels change when labels are omitted", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      await updateDeal(
        db,
        adminSession(u.id),
        { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString(), title: "X" },
        new AbortController().signal,
      );
      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      expect(log.some((c) => c.field === "labels")).toBe(false);
    });
  });

  it("does NOT record a labels change when the value is unchanged", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      await updateDeal(
        db,
        adminSession(u.id),
        { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString(), labels: [] },
        new AbortController().signal,
      );
      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      expect(log.some((c) => c.field === "labels")).toBe(false);
    });
  });

  it("accepts sourceChannel, persists it, and records a source_channel change", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          sourceChannel: "outbound",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.sourceChannel).toBe("outbound");
      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      const chg = log.find((c) => c.field === "source_channel");
      expect(chg).toBeDefined();
      expect(chg?.newValue).toBe("outbound");
    });
  });

  it("records a change row per edited field: title, value, expectedCloseDate", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: "Renamed Deal",
          value: 2000,
          expectedCloseDate: "2026-08-01",
        },
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;

      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);

      const title = log.find((c) => c.field === "title");
      expect(title?.oldValue).toBe("Initial");
      expect(title?.newValue).toBe("Renamed Deal");
      expect(title?.actorId).toBe(u.id);

      const value = log.find((c) => c.field === "value");
      expect(value?.oldValue).toBeNull();
      expect(value?.newValue).toBe("2000.00");

      const closeDate = log.find((c) => c.field === "expected_close_date");
      expect(closeDate?.oldValue).toBeNull();
      expect(closeDate?.newValue).toBe("2026-08-01");
    });
  });

  it("does NOT record a change row for a field re-submitted with its current value", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt.toISOString(),
          title: deal.title,
        },
        new AbortController().signal,
      );
      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      expect(log.some((c) => c.field === "title")).toBe(false);
      expect(log.some((c) => c.field === "value")).toBe(false);
      expect(log.some((c) => c.field === "expected_close_date")).toBe(false);
    });
  });

  it("links, then unlinks, the primary person and logs person_id both ways", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const owner = await seedUser(db);
      const [person] = await db
        .insert(persons)
        .values({ name: "Jane", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (person === undefined) throw new Error("setup: person insert failed");

      // Link null -> person.id.
      const linked = await updateDeal(
        db,
        adminSession(u.id),
        { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString(), personId: person.id },
        new AbortController().signal,
      );
      expect(linked.ok).toBe(true);
      if (linked.ok === false) return;
      expect(linked.value.personId).toBe(person.id);

      // Unlink person.id -> null.
      const unlinked = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: linked.value.updatedAt.toISOString(),
          personId: null,
        },
        new AbortController().signal,
      );
      expect(unlinked.ok).toBe(true);

      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      const rows = log.filter((c) => c.field === "person_id");
      expect(rows.length).toBe(2);
      // Newest-first: unlink then link.
      expect(rows[0]?.oldValue).toBe(person.id);
      expect(rows[0]?.newValue).toBeNull();
      expect(rows[1]?.oldValue).toBeNull();
      expect(rows[1]?.newValue).toBe(person.id);
      expect(rows[1]?.actorId).toBe(u.id);
    });
  });

  it("logs org_id on link; re-submitting the same orgId logs nothing", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const owner = await seedUser(db);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (org === undefined) throw new Error("setup: org insert failed");

      const linked = await updateDeal(
        db,
        adminSession(u.id),
        { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString(), orgId: org.id },
        new AbortController().signal,
      );
      expect(linked.ok).toBe(true);
      if (linked.ok === false) return;

      // Re-submit the same orgId: no-op, logs nothing new.
      const again = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: linked.value.updatedAt.toISOString(),
          orgId: org.id,
        },
        new AbortController().signal,
      );
      expect(again.ok).toBe(true);

      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      const rows = log.filter((c) => c.field === "org_id");
      expect(rows.length).toBe(1);
      expect(rows[0]?.oldValue).toBeNull();
      expect(rows[0]?.newValue).toBe(org.id);
    });
  });

  it("rejects a relink to a person the actor cannot see and logs nothing", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const stranger = await seedUser(db);
      // Owner-visibility person owned by someone else: a regular (non-admin) editor of the
      // deal must not be able to relink to (or probe) it.
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Secret", ownerId: stranger.id, visibilityLevel: "owner" })
        .returning();
      if (hidden === undefined) throw new Error("setup: hidden person insert failed");

      const r = await updateDeal(
        db,
        // Regular owner-editor of the deal (passes the deal-edit gate) who nonetheless cannot
        // SEE the stranger-owned owner-visibility person, so the relink must be rejected.
        regularSession(u.id),
        { dealId: deal.id, expectedUpdatedAt: deal.updatedAt.toISOString(), personId: hidden.id },
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);

      const [after] = await db.select().from(deals).where(eq(deals.id, deal.id));
      expect(after?.personId).toBeNull();
      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      expect(log.some((c) => c.field === "person_id")).toBe(false);
    });
  });
});
