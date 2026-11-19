import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import type { TestDb } from "./search.test-helpers";

async function plan(db: TestDb, statement: string): Promise<string> {
  let text = "";
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL enable_seqscan = off`);
    const r = await tx.execute(sql.raw(`EXPLAIN ${statement}`));
    text = r.rows.map((x) => (x as Record<string, string>)["QUERY PLAN"]).join("\n");
  });
  return text;
}

const CASES: Array<[string, string, string]> = [
  ["deals_title_trgm", "SELECT 1 FROM deals WHERE title ILIKE '%abc%'", ""],
  ["leads_title_trgm", "SELECT 1 FROM leads WHERE title ILIKE '%abc%'", ""],
  ["persons_name_trgm", "SELECT 1 FROM persons WHERE name ILIKE '%abc%'", ""],
  [
    "persons_primary_email_trgm",
    "SELECT 1 FROM persons WHERE primary_email::text ILIKE '%abc%'",
    "person_email_idx",
  ],
  ["organizations_name_trgm", "SELECT 1 FROM organizations WHERE name ILIKE '%abc%'", ""],
  [
    "organizations_domain_trgm",
    "SELECT 1 FROM organizations WHERE split_part(regexp_replace(lower(coalesce(domain, '')), '^(https?://)?(www\\.)?', ''), '/', 1) ILIKE '%abc%'",
    "",
  ],
  [
    "notes_body_plain_trgm",
    "SELECT 1 FROM notes WHERE deleted_at IS NULL AND search_plain_text(body) ILIKE '%abc%'",
    "notes_entity_idx",
  ],
  ["comments_body_trgm", "SELECT 1 FROM comments WHERE body ILIKE '%abc%'", ""],
  ["activities_subject_trgm", "SELECT 1 FROM activities WHERE subject ILIKE '%abc%'", ""],
  [
    "activities_note_plain_trgm",
    "SELECT 1 FROM activities WHERE search_plain_text(note) ILIKE '%abc%'",
    "",
  ],
  ["email_threads_subject_trgm", "SELECT 1 FROM email_threads WHERE subject ILIKE '%abc%'", ""],
  ["email_messages_subject_trgm", "SELECT 1 FROM email_messages WHERE subject ILIKE '%abc%'", ""],
  [
    "email_messages_body_text_trgm",
    "SELECT 1 FROM email_messages WHERE body_text ILIKE '%abc%'",
    "",
  ],
  [
    "email_messages_body_html_plain_trgm",
    "SELECT 1 FROM email_messages WHERE search_plain_text(body_html) ILIKE '%abc%'",
    "",
  ],
  [
    "email_messages_from_name_trgm",
    "SELECT 1 FROM email_messages WHERE from_name ILIKE '%abc%'",
    "",
  ],
  [
    "email_messages_from_email_trgm",
    "SELECT 1 FROM email_messages WHERE from_email::text ILIKE '%abc%'",
    "",
  ],
  [
    "deal_intercom_search_plain_trgm",
    "SELECT 1 FROM deal_intercom_search WHERE plain_text ILIKE '%abc%'",
    "",
  ],
  [
    "files_filename_trgm",
    "SELECT 1 FROM files WHERE status = 'ready' AND filename ILIKE '%abc%'",
    "",
  ],
];

describe("trigram index use", () => {
  it.each(
    CASES,
  )("%s serves its predicate with a bitmap index scan", async (name, statement, competingBtree) => {
    await withTestDb(async (db) => {
      if (competingBtree !== "") await db.execute(sql.raw(`DROP INDEX ${competingBtree}`));
      const text = await plan(db, statement);
      expect(text).toContain(`Bitmap Index Scan on ${name}`);
      expect(text).toMatch(/Index Cond: .*~~\*/);
    });
  });
});
