import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";

async function leadingIndexColumns(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  table: string,
): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT a.attname AS col
    FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE c.relname = ${table}
  `);
  return (rows.rows as { col: string }[]).map((r) => r.col);
}

describe("email lookup indexes", () => {
  it("indexes messages by thread, which every inbox row looks up several times", async () => {
    await withTestDb(async (db) => {
      expect(await leadingIndexColumns(db, "email_messages")).toContain("thread_id");
    });
  });

  it("indexes attachments by message, which the inbox paperclip checks per thread", async () => {
    await withTestDb(async (db) => {
      expect(await leadingIndexColumns(db, "email_message_attachments")).toContain("message_id");
    });
  });
});
