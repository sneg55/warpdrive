import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThread } from "./router";

// Regression: a text/plain-only inbound email (body_html NULL, only body_text set) used to render
// a BLANK body because getThread selected and sanitized only body_html. Gmail delivers many
// transactional / notification / mailing-list emails as text/plain, and Pipedrive renders them
// with line breaks preserved and URLs/emails auto-linked. WD must match, not show an empty frame.

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function actorOf(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

describe("thread.get plain-text body fallback", () => {
  it("renders a plain-text (no HTML part) body with newlines + linkified URL and email", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${owner.id}, 'o@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_text, sent_at)
        VALUES (${thr.id}, ${acctId.id}, 'm1', 'inbound', 'a@y.com',
          E'Hello Nick,\nSee https://example.com/x for details.\nReply to support@hetzner.com.', now())
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        const body = out.value.messages[0]?.bodyHtml ?? "";
        expect(body).not.toBe("");
        expect(body).toContain("Hello Nick,");
        expect(body).toContain('href="https://example.com/x"');
        expect(body).toContain('href="mailto:support@hetzner.com"');
        expect(body).toMatch(/<br\s*\/?>/i); // newline preserved
      }
    });
  });

  it("prefers the HTML part when both body_html and body_text are present", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${owner.id}, 'o@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html, body_text, sent_at)
        VALUES (${thr.id}, ${acctId.id}, 'm1', 'inbound', 'a@y.com', '<p>rich</p>', 'plain', now())
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        const body = out.value.messages[0]?.bodyHtml ?? "";
        expect(body).toContain("<p>rich</p>");
        expect(body).not.toContain("plain");
      }
    });
  });
});
