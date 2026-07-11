import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";

describe("phase 5 schema", () => {
  it("creates notifications, notification_preferences, mentions tables", async () => {
    await withTestDb(async (db) => {
      const rows = await db.execute(sql`
        select table_name from information_schema.tables
        where table_name in ('notifications','notification_preferences','mentions')
        order by table_name
      `);
      expect(rows.rows.map((r) => r.table_name)).toEqual([
        "mentions",
        "notification_preferences",
        "notifications",
      ]);
    });
  });

  it("declares notification_type enum with all 9 values", async () => {
    await withTestDb(async (db) => {
      const rows = await db.execute(sql`
        select enumlabel from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'notification_type' order by enumlabel
      `);
      expect(rows.rows.map((r) => r.enumlabel).sort()).toEqual(
        [
          "activity_assigned",
          "activity_reminder",
          "comment_reply",
          "deal_followed_update",
          "deal_lost",
          "deal_won",
          "email_click",
          "email_open",
          "mention",
        ].sort(),
      );
    });
  });

  it("has a search_tsv generated column on deals with a GIN index", async () => {
    await withTestDb(async (db) => {
      const col = await db.execute(sql`
        select is_generated from information_schema.columns
        where table_name = 'deals' and column_name = 'search_tsv'
      `);
      expect(col.rows[0]?.is_generated).toBe("ALWAYS");
      const idx = await db.execute(sql`
        select indexdef from pg_indexes
        where tablename = 'deals' and indexdef ilike '%using gin%search_tsv%'
      `);
      expect(idx.rows.length).toBeGreaterThan(0);
    });
  });
});
