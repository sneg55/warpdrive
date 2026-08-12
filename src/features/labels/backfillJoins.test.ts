// Migration 0060 repairs what 0046 left behind: 0046 seeded the catalog for deal/person/org and
// backfilled their join tables, but skipped the 'lead' target entirely (the enum value had just
// been added and Postgres forbids using it in the same transaction), and no writer has kept the
// join tables in step since. So records can carry label names that exist in no catalog row.
//
// The test executes the REAL migration file against seeded pre-migration state rather than
// reimplementing its SQL, which is the only way to prove the shipped statements do the work. The
// migration is idempotent, so re-running it on the already-migrated template is exactly what a
// deploy does to a live database.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

const MIGRATION = path.join(process.cwd(), "drizzle", "0060_label_join_backfill.sql");

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function runMigration(db: Db): Promise<void> {
  const text = readFileSync(MIGRATION, "utf8");
  for (const statement of text.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed === "") continue;
    await db.execute(sql.raw(trimmed));
  }
}

describe("migration 0060: label join backfill", () => {
  it("adopts an applied name that has no catalog row, and links it", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      // Written straight to the column, the way every pre-0060 writer did.
      const [lead] = await db
        .insert(leads)
        .values({
          title: "Orphaned",
          ownerId: u.id,
          visibilityLevel: "all",
          labels: ["high priority"],
        })
        .returning();
      if (lead === undefined) throw new Error("setup failed");

      await runMigration(db);

      const adopted = await db.execute(
        sql`select "color" from "labels" where "target" = 'lead' and lower("name") = 'high priority'`,
      );
      expect(adopted.rows).toHaveLength(1);
      const linked = await db.execute(
        sql`select 1 from "lead_labels" ll join "labels" l on l."id" = ll."label_id"
            where ll."lead_id" = ${lead.id} and lower(l."name") = 'high priority'`,
      );
      expect(linked.rows).toHaveLength(1);
    });
  });

  it("links an applied name to the catalog row it already matches, case-insensitively", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      await db.execute(
        sql`insert into "labels" ("target", "name", "color", "order") values ('lead', 'Working', 'orange', 0)`,
      );
      const [lead] = await db
        .insert(leads)
        .values({ title: "Cased", ownerId: u.id, visibilityLevel: "all", labels: ["working"] })
        .returning();
      if (lead === undefined) throw new Error("setup failed");

      await runMigration(db);

      const rows = await db.execute(
        sql`select l."name" from "lead_labels" ll join "labels" l on l."id" = ll."label_id"
            where ll."lead_id" = ${lead.id}`,
      );
      expect(rows.rows).toEqual([{ name: "Working" }]);
      // No second catalog row was invented for the differently-cased application.
      const catalog = await db.execute(
        sql`select count(*)::int as n from "labels" where "target" = 'lead' and lower("name") = 'working'`,
      );
      expect(catalog.rows[0]).toEqual({ n: 1 });
    });
  });

  it("leaves a record with no labels unlinked", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const [lead] = await db
        .insert(leads)
        .values({ title: "Bare", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      if (lead === undefined) throw new Error("setup failed");

      await runMigration(db);

      const rows = await db.execute(sql`select 1 from "lead_labels" where "lead_id" = ${lead.id}`);
      expect(rows.rows).toHaveLength(0);
    });
  });

  it("rejects a duplicate name within one target, so name lookups stay unambiguous", async () => {
    await withTestDb(async (db) => {
      await db.execute(
        sql`insert into "labels" ("target", "name", "color", "order") values ('lead', 'Dupe', 'red', 0)`,
      );
      await expect(
        db.execute(
          sql`insert into "labels" ("target", "name", "color", "order") values ('lead', 'dupe', 'blue', 1)`,
        ),
      ).rejects.toThrow();
      // The same name under a different target is still fine.
      await db.execute(
        sql`insert into "labels" ("target", "name", "color", "order") values ('deal', 'Dupe', 'red', 9)`,
      );
    });
  });
});
