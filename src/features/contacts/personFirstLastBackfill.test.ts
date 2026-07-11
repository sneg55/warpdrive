import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import type * as schema from "@/db/schema";
import { persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

type Db = NodePgDatabase<typeof schema>;

// The test harness migrates a shared template once, before any test-specific row exists
// (see vitest.globalSetup.ts), so the persons table already has first_name/last_name by
// the time a test can insert a row: the migration's own UPDATE never runs against rows
// inserted here. Re-run the exact backfill statement from
// drizzle/0041_mysterious_lily_hollister.sql against name-only rows to verify the
// splitting logic itself is correct.
async function runBackfill(db: Db): Promise<void> {
  await db.execute(sql`
    UPDATE "persons" SET
      "first_name" = CASE WHEN position(' ' in btrim("name")) > 0
        THEN substring(btrim("name") from 1 for position(' ' in btrim("name")) - 1) ELSE btrim("name") END,
      "last_name" = CASE WHEN position(' ' in btrim("name")) > 0
        THEN NULLIF(btrim(substring(btrim("name") from position(' ' in btrim("name")) + 1)), '') ELSE NULL END
    WHERE "first_name" IS NULL AND "last_name" IS NULL
  `);
}

describe("person first_name/last_name backfill", () => {
  it("splits an existing name into first_name/last_name and preserves name", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [inserted] = await db
        .insert(persons)
        .values({
          name: "Mia Silva",
          primaryEmail: "mia.silva@example.com",
          emails: [],
          phones: [],
          orgId: null,
          ownerId: owner.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        })
        .returning();
      if (!inserted) throw new Error("setup: insert returned no rows");

      await runBackfill(db);

      const result = await db.execute<{
        name: string;
        first_name: string | null;
        last_name: string | null;
      }>(sql`SELECT name, first_name, last_name FROM persons WHERE id = ${inserted.id}`);
      const row = result.rows[0];
      if (!row) throw new Error("expected a row back from persons");

      expect(row.name).toBe("Mia Silva");
      expect(row.first_name).toBe("Mia");
      expect(row.last_name).toBe("Silva");
    });
  });

  it("treats a single-word name as first_name only, leaving last_name null", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const [inserted] = await db
        .insert(persons)
        .values({
          name: "Cher",
          primaryEmail: "cher@example.com",
          emails: [],
          phones: [],
          orgId: null,
          ownerId: owner.id,
          visibilityLevel: "all",
          visibilityGroupId: null,
          customFields: {},
        })
        .returning();
      if (!inserted) throw new Error("setup: insert returned no rows");

      await runBackfill(db);

      const result = await db.execute<{
        name: string;
        first_name: string | null;
        last_name: string | null;
      }>(sql`SELECT name, first_name, last_name FROM persons WHERE id = ${inserted.id}`);
      const row = result.rows[0];
      if (!row) throw new Error("expected a row back from persons");

      expect(row.name).toBe("Cher");
      expect(row.first_name).toBe("Cher");
      expect(row.last_name).toBeNull();
    });
  });

  // Finding 4: the backfill must trim, matching splitName's behavior, so leading/trailing
  // whitespace around a legacy `name` value does not diverge from the pure-JS splitter.
  async function insertPerson(db: Db, name: string): Promise<{ id: string; ownerId: string }> {
    const owner = await seedUser(db);
    const [inserted] = await db
      .insert(persons)
      .values({
        name,
        primaryEmail: null,
        emails: [],
        phones: [],
        orgId: null,
        ownerId: owner.id,
        visibilityLevel: "all",
        visibilityGroupId: null,
        customFields: {},
      })
      .returning();
    if (!inserted) throw new Error("setup: insert returned no rows");
    return inserted;
  }

  async function firstLastFor(
    db: Db,
    id: string,
  ): Promise<{ first_name: string | null; last_name: string | null }> {
    const result = await db.execute<{ first_name: string | null; last_name: string | null }>(
      sql`SELECT first_name, last_name FROM persons WHERE id = ${id}`,
    );
    const row = result.rows[0];
    if (!row) throw new Error("expected a row back from persons");
    return row;
  }

  it("treats a trailing-space single-word name as first_name only (last_name NULL, not '')", async () => {
    await withTestDb(async (db) => {
      const inserted = await insertPerson(db, "Mia ");
      await runBackfill(db);
      const row = await firstLastFor(db, inserted.id);
      expect(row.first_name).toBe("Mia");
      expect(row.last_name).toBeNull();
    });
  });

  it("does not truncate first_name to empty when the name has a leading space", async () => {
    await withTestDb(async (db) => {
      const inserted = await insertPerson(db, " Mia Silva");
      await runBackfill(db);
      const row = await firstLastFor(db, inserted.id);
      expect(row.first_name).toBe("Mia");
      expect(row.last_name).toBe("Silva");
    });
  });

  it("trims the remainder so a run of inner whitespace does not leak into last_name", async () => {
    await withTestDb(async (db) => {
      const inserted = await insertPerson(db, "Mia  Silva");
      await runBackfill(db);
      const row = await firstLastFor(db, inserted.id);
      expect(row.first_name).toBe("Mia");
      expect(row.last_name).toBe("Silva");
    });
  });
});
