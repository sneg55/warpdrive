// Codex finding F30: upsertThread returned early for an existing thread and only touched
// updated_at, never advancing last_message_at. listInbox orders by last_message_at DESC, so
// a conversation that receives a reply stayed buried. A new message on an existing thread
// must advance last_message_at to the newer sent time.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import type { AuthUser } from "@/features/permissions/types";
import { applyMessageIds } from "./applyMessages";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const signal = new AbortController().signal;

function msg(id: string, threadId: string, dateHeader: string): GmailMessage {
  return {
    id,
    threadId,
    labelIds: [],
    snippet: "hi",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "jane@acme.com" },
        { name: "To", value: "o@gunsnation.com" },
        { name: "Subject", value: "Hello" },
        { name: "Date", value: dateHeader },
      ],
      body: { data: Buffer.from("body").toString("base64url") },
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

describe("applyMessageIds thread ordering", () => {
  it("advances last_message_at when a newer message arrives on an existing thread", async () => {
    await withTestDb(async (db) => {
      const { acctId, owner } = await seed(db);
      const fake = new FakeGmailClient();
      fake.messages.set("m1", msg("m1", "t1", "Tue, 01 Jul 2025 10:00:00 +0000"));
      fake.messages.set("m2", msg("m2", "t1", "Tue, 01 Jul 2025 15:00:00 +0000"));

      await applyMessageIds({ db, accountId: acctId, owner, gmail: fake, signal }, ["m1"]);
      const before = (
        await db.execute(sql`SELECT last_message_at FROM email_threads WHERE account_id=${acctId}`)
      ).rows[0] as { last_message_at: string };

      // A reply arrives on the SAME thread with a later Date.
      await applyMessageIds({ db, accountId: acctId, owner, gmail: fake, signal }, ["m2"]);
      const after = (
        await db.execute(sql`SELECT last_message_at FROM email_threads WHERE account_id=${acctId}`)
      ).rows[0] as { last_message_at: string };

      expect(new Date(after.last_message_at).getTime()).toBeGreaterThan(
        new Date(before.last_message_at).getTime(),
      );
    });
  });
});
