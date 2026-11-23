import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { ok } from "@/types/result";
import { applyParsedMessages } from "./applyMessages";
import type { ParsedMessage } from "./mimeParse";

const signal = new AbortController().signal;

function parsed(id: string, threadId: string): ParsedMessage {
  return {
    gmailMessageId: id,
    threadId,
    fromEmail: "jane@acme.com",
    fromName: "Jane",
    toEmails: ["o@gunsnation.com"],
    ccEmails: [],
    subject: "Hello",
    snippet: "hi",
    bodyHtml: null,
    bodyText: "body",
    sentAt: new Date("2026-11-01T10:00:00Z"),
    participants: ["jane@acme.com", "o@gunsnation.com"],
    attachments: [],
  };
}

describe("applyParsedMessages", () => {
  it("stores already-parsed messages without a provider fetch and skips a repeat", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name) VALUES ('o@gunsnation.com','O') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'o@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const touched = new Set<string>();

      const first = await applyParsedMessages(
        { db, accountId: acct.id, signal, touchedThreadIds: touched },
        [parsed("p1", "pt1"), parsed("p2", "pt1")],
      );
      const repeat = await applyParsedMessages({ db, accountId: acct.id, signal }, [
        parsed("p1", "pt1"),
      ]);

      const rows = (
        await db.execute(sql`
          SELECT m.gmail_message_id, m.direction, m.from_name, t.gmail_thread_id
          FROM email_messages m JOIN email_threads t ON t.id = m.thread_id
          WHERE m.account_id=${acct.id} ORDER BY m.gmail_message_id`)
      ).rows;
      expect(first).toEqual(ok(2));
      expect(repeat).toEqual(ok(0));
      expect([...touched]).toEqual(["pt1"]);
      expect(rows).toEqual([
        { gmail_message_id: "p1", direction: "inbound", from_name: "Jane", gmail_thread_id: "pt1" },
        { gmail_message_id: "p2", direction: "inbound", from_name: "Jane", gmail_thread_id: "pt1" },
      ]);
    });
  });
});
