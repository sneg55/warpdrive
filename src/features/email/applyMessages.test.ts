// Task 4: applyMessageIds must persist inbound attachment metadata (not just the body)
// into email_message_attachments, in the same tx as the message insert.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import type { AuthUser } from "@/features/permissions/types";
import { applyMessageIds } from "./applyMessages";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const signal = new AbortController().signal;

// A message with one text/plain body part and one PDF attachment part.
function msgWithAttachment(id: string, threadId: string): GmailMessage {
  return {
    id,
    threadId,
    labelIds: [],
    snippet: "hi",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "jane@acme.com" },
        { name: "To", value: "o@gunsnation.com" },
        { name: "Subject", value: "Invoice" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: Buffer.from("body").toString("base64url") } },
        {
          mimeType: "application/pdf",
          filename: "invoice.pdf",
          body: { attachmentId: "a1", size: 88190 },
        },
      ],
    },
  };
}

async function seed(db: TestDb): Promise<{ acctId: string; owner: AuthUser }> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('o@gunsnation.com','O','sub-o') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return {
    acctId: acct.id,
    owner: { id: u.id, type: "regular", isActive: true, groupIds: new Set() },
  };
}

describe("applyMessageIds attachment persistence", () => {
  it("inserts one email_message_attachments row for an inbound message with an attachment", async () => {
    await withTestDb(async (db) => {
      const { acctId, owner } = await seed(db);
      const fake = new FakeGmailClient();
      fake.messages.set("m1", msgWithAttachment("m1", "t1"));

      await applyMessageIds({ db, accountId: acctId, owner, gmail: fake, signal }, ["m1"]);

      const message = (
        await db.execute(sql`SELECT id FROM email_messages WHERE account_id=${acctId}`)
      ).rows[0] as { id: string };

      const rows = (
        await db.execute(
          sql`SELECT filename, mime_type, size_bytes, gmail_attachment_id, account_id
              FROM email_message_attachments WHERE message_id=${message.id}`,
        )
      ).rows as {
        filename: string;
        mime_type: string;
        size_bytes: number;
        gmail_attachment_id: string;
        account_id: string;
      }[];

      expect(rows).toHaveLength(1);
      // node-pg returns bigint columns as strings to avoid precision loss; coerce for comparison.
      expect({ ...rows[0], size_bytes: Number(rows[0]?.size_bytes) }).toMatchObject({
        filename: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: 88190,
        gmail_attachment_id: "a1",
        account_id: acctId,
      });
    });
  });

  it("does not duplicate attachment rows when the same message id is re-applied (ON CONFLICT no-op)", async () => {
    await withTestDb(async (db) => {
      const { acctId, owner } = await seed(db);
      const fake = new FakeGmailClient();
      fake.messages.set("m1", msgWithAttachment("m1", "t1"));

      await applyMessageIds({ db, accountId: acctId, owner, gmail: fake, signal }, ["m1"]);
      await applyMessageIds({ db, accountId: acctId, owner, gmail: fake, signal }, ["m1"]);

      const message = (
        await db.execute(sql`SELECT id FROM email_messages WHERE account_id=${acctId}`)
      ).rows[0] as { id: string };
      const count = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM email_message_attachments WHERE message_id=${message.id}`,
        )
      ).rows[0] as { n: number };

      expect(count.n).toBe(1);
    });
  });
});
