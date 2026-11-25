import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { brevoCampaigns, brevoContactCampaigns, brevoTrackedEmails } from "./index";

describe("brevo schema", () => {
  test("a contact campaign row keeps its history when the campaign is not in the catalog", async () => {
    await withTestDb(async (db) => {
      await db.insert(brevoContactCampaigns).values({ email: "pat@example.com", campaignId: 7 });
      const rows = await db.select().from(brevoContactCampaigns);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.clickedUrls).toEqual([]);
    });
  });

  test("stores campaign ids beyond 32 bits", async () => {
    await withTestDb(async (db) => {
      await db.insert(brevoCampaigns).values({ id: 5_000_000_000, name: "Big", status: "sent" });
      const [row] = await db
        .select()
        .from(brevoCampaigns)
        .where(eq(brevoCampaigns.id, 5_000_000_000));
      expect(row?.name).toBe("Big");
    });
  });

  test("rejects an email that is not lowercased and trimmed", async () => {
    await withTestDb(async (db) => {
      await expect(
        db.insert(brevoContactCampaigns).values({ email: "Pat@Example.com", campaignId: 1 }),
      ).rejects.toThrow();
      await expect(
        db.insert(brevoTrackedEmails).values({ email: " pat@example.com" }),
      ).rejects.toThrow();
    });
  });

  test("a tracked email is active by default with no coverage", async () => {
    await withTestDb(async (db) => {
      await db.insert(brevoTrackedEmails).values({ email: "pat@example.com" });
      const [row] = await db.select().from(brevoTrackedEmails);
      expect(row?.active).toBe(true);
      expect(row?.coveredThrough).toBeNull();
    });
  });

  test("a contact campaign is unique per email and campaign", async () => {
    await withTestDb(async (db) => {
      const row = { email: "pat@example.com", campaignId: 1 };
      await db.insert(brevoContactCampaigns).values(row);
      await expect(db.insert(brevoContactCampaigns).values(row)).rejects.toThrow();
    });
  });
});
