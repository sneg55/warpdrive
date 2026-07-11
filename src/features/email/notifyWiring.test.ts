// notifyWiring.test.ts: integration test proving notifyEmailEvent fires after
// recordEvent records a tracking hit.
//
// RED: fails until recordEvent is wired to call notifyEmailEvent after the
// transaction commits.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { backfillTokens, mintTokensForSend } from "./tracking";
import { recordEvent } from "./trackingRecord";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedMailboxAndMessage(db: Db): Promise<{
  userId: string;
  accountId: string;
  messageId: string;
  threadId: string;
}> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub)
          VALUES (${`track-${Date.now()}@example.com`}, 'Track User', ${`sub-track-${Date.now()}`})
          RETURNING id`,
    )
  ).rows[0] as { id: string };

  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address)
          VALUES (${u.id}, ${`track-${Date.now()}@example.com`}) RETURNING id`,
    )
  ).rows[0] as { id: string };

  const attempt = (
    await db.execute(
      sql`INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload)
          VALUES (gen_random_uuid(), ${`hdr-${Date.now()}`}, ${acct.id}, '{}'::jsonb) RETURNING id`,
    )
  ).rows[0] as { id: string };

  const thread = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id)
          VALUES (${`gthread-${Date.now()}`}, ${acct.id}) RETURNING id`,
    )
  ).rows[0] as { id: string };

  const msg = (
    await db.execute(
      sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email)
          VALUES (${thread.id}, ${acct.id}, ${`gmsg-${Date.now()}`}, 'outbound', ${`track-${Date.now()}@example.com`})
          RETURNING id`,
    )
  ).rows[0] as { id: string };

  // Update attempt to link thread (for composite FK).
  await db.execute(
    sql`UPDATE email_send_attempts SET thread_id = ${thread.id} WHERE id = ${attempt.id}`,
  );

  return { userId: u.id, accountId: acct.id, messageId: msg.id, threadId: thread.id };
}

describe("recordEvent notification wiring: email_open", () => {
  it("fires an email_open notification to the mailbox owner after recording an open event", async () => {
    await withTestDb(async (db) => {
      const { userId, messageId } = await seedMailboxAndMessage(db);

      // Mint an open token for the send attempt, then backfill the message_id.
      const attemptRow = (
        await db.execute(sql`SELECT id FROM email_send_attempts WHERE account_id = (
          SELECT id FROM email_accounts WHERE user_id = ${userId}
        ) LIMIT 1`)
      ).rows[0] as { id: string };

      const mint = await mintTokensForSend(db, {
        sendAttemptId: attemptRow.id,
        recipient: "recipient@example.com",
        links: [],
        trackOpens: true,
        trackLinks: true,
        signal: new AbortController().signal,
      });

      await backfillTokens(db, {
        sendAttemptId: attemptRow.id,
        messageId,
        signal: new AbortController().signal,
      });

      const openToken = mint.openToken;
      expect(openToken).not.toBeNull();
      if (openToken === null) return;

      // recordEvent should, after this wiring, fire notifyEmailEvent.
      await recordEvent(db, openToken, "Mozilla/5.0", "open", new AbortController().signal);

      const rows = await db.select().from(notifications).where(sql`user_id = ${userId}::uuid`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.type).toBe("email_open");
    });
  });
});
