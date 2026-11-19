import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { decodeEmailSnippet } from "@/features/email/snippetText";
import { withTestDb } from "./testing";

async function plain(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  input: string | null,
): Promise<string | null> {
  const r = await db.execute(sql`SELECT search_plain_text(${input}) AS t`);
  return (r.rows[0] as { t: string | null }).t;
}

describe("search_plain_text", () => {
  it("strips tags and collapses whitespace", async () => {
    await withTestDb(async (db) => {
      expect(await plain(db, "<div>Hello<br>  <b>big</b>\n\nworld</div>")).toBe("Hello big world");
    });
  });

  it("does not leave tag names to match", async () => {
    await withTestDb(async (db) => {
      expect(await plain(db, '<div class="x">body</div>')).toBe("body");
    });
  });

  it("decodes named and numeric entities", async () => {
    await withTestDb(async (db) => {
      expect(await plain(db, "R&amp;D &lt;ok&gt; &quot;q&quot; it&apos;s &#65;&#x42;")).toBe(
        `R&D <ok> "q" it's AB`,
      );
    });
  });

  it("decodes in a single pass like the TypeScript decoder", async () => {
    await withTestDb(async (db) => {
      for (const input of ["&amp;lt;", "&#38;amp;", "&bogus; &#0; &#99999999999;", "a & b &"]) {
        expect(await plain(db, input)).toBe(decodeEmailSnippet(input)?.trim());
      }
    });
  });

  it("returns null for null", async () => {
    await withTestDb(async (db) => {
      expect(await plain(db, null)).toBeNull();
    });
  });

  it("creates the deal_intercom_search table with its btree indexes", async () => {
    await withTestDb(async (db) => {
      const r = await db.execute(
        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'deal_intercom_search'`,
      );
      const names = r.rows.map((x) => (x as { indexname: string }).indexname);
      expect(names).toEqual(
        expect.arrayContaining([
          "deal_intercom_search_pk",
          "deal_intercom_search_deal_idx",
          "deal_intercom_search_conversation_idx",
          "deal_intercom_search_contact_idx",
        ]),
      );
    });
  });
});
