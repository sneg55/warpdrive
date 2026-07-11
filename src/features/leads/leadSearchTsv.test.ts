import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

// db.execute returns { rows: unknown[] } for raw SQL (node-postgres driver), not an array.
interface RowsResult {
  rows: Array<{ id: string }>;
}

describe("leads.search_tsv", () => {
  it("is generated from the title and matches a websearch query", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await db.insert(schema.leads).values({
        title: "Acme onboarding",
        ownerId: owner.id,
        visibilityLevel: "all",
      });

      const result = await db.execute(sql`
        SELECT id FROM leads
        WHERE search_tsv @@ websearch_to_tsquery('simple', 'onboarding')
      `);
      const rows = (result as unknown as RowsResult).rows;
      expect(rows.length).toBe(1);
    });
  });

  it("does not match an unrelated term", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await db.insert(schema.leads).values({
        title: "Acme onboarding",
        ownerId: owner.id,
        visibilityLevel: "all",
      });

      const result = await db.execute(sql`
        SELECT id FROM leads
        WHERE search_tsv @@ websearch_to_tsquery('simple', 'zephyr')
      `);
      const rows = (result as unknown as RowsResult).rows;
      expect(rows.length).toBe(0);
    });
  });
});
