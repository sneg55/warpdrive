// Integration test; real DB (per CLAUDE.md, no mocked database).
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { backfillTokens, mintTokensForSend, recordClick, recordOpen } from "./tracking";
import { trackingForMessages } from "./trackingReads";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);

// Seed a send attempt plus a sent (outbound) message, mirroring tracking.test.ts's
// seedAttempt so tracking events (message_id NOT NULL) can reference a real message.
async function seedAttempt(
  db: TestDb,
): Promise<{ attemptId: string; accountId: string; messageId: string }> {
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
  const att = (
    await db.execute(sql`
      INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload)
      VALUES (gen_random_uuid(), 'h1', ${acct.id}, '{}'::jsonb) RETURNING id
    `)
  ).rows[0] as { id: string };
  const thread = (
    await db.execute(sql`
      INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acct.id}) RETURNING id
    `)
  ).rows[0] as { id: string };
  const msg = (
    await db.execute(sql`
      INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email)
      VALUES (${thread.id}, ${acct.id}, 'g1', 'outbound', 'o@gunsnation.com') RETURNING id
    `)
  ).rows[0] as { id: string };
  return { attemptId: att.id, accountId: acct.id, messageId: msg.id };
}

describe("trackingForMessages", () => {
  it("returns one open entry for a message with a single recorded open", async () => {
    await withTestDb(async (db) => {
      const { attemptId, messageId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: [],
        trackOpens: true,
        trackLinks: false,
        signal: SIG(),
      });
      await backfillTokens(db, { sendAttemptId: attemptId, messageId, signal: SIG() });
      const openToken = out.openToken;
      expect(openToken).not.toBeNull();
      if (openToken !== null) await recordOpen(db, openToken, "Mozilla/5.0", SIG());

      const history = await trackingForMessages(db, [messageId], SIG());
      expect(history.get(messageId)).toHaveLength(1);
      expect(history.get(messageId)?.[0]?.type).toBe("open");
      expect(typeof history.get(messageId)?.[0]?.at).toBe("string");
    });
  });

  it("aggregates multiple open + click events per message, newest first", async () => {
    await withTestDb(async (db) => {
      const { attemptId, messageId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: ["https://dest.com/x"],
        trackOpens: true,
        trackLinks: true,
        signal: SIG(),
      });
      await backfillTokens(db, { sendAttemptId: attemptId, messageId, signal: SIG() });
      const openToken = out.openToken;
      const linkToken = out.linkTokens[0];
      expect(openToken).not.toBeNull();
      expect(linkToken).toBeDefined();
      if (openToken !== null) {
        await recordOpen(db, openToken, "UA1", SIG());
        await recordOpen(db, openToken, "UA2", SIG());
      }
      if (linkToken !== undefined) await recordClick(db, linkToken.token, "UA3", SIG());

      const history = await trackingForMessages(db, [messageId], SIG());
      const entries = history.get(messageId) ?? [];
      expect(entries).toHaveLength(3);
      expect(entries.filter((e) => e.type === "open")).toHaveLength(2);
      expect(entries.filter((e) => e.type === "click")).toHaveLength(1);
      // Newest first: each entry's `at` is >= the next one's.
      for (let i = 0; i + 1 < entries.length; i++) {
        expect(new Date(entries[i]?.at ?? 0).getTime()).toBeGreaterThanOrEqual(
          new Date(entries[i + 1]?.at ?? 0).getTime(),
        );
      }
    });
  });

  it("returns an empty array for a message with no tracking events", async () => {
    await withTestDb(async (db) => {
      const { messageId } = await seedAttempt(db);
      const history = await trackingForMessages(db, [messageId], SIG());
      expect(history.get(messageId) ?? []).toEqual([]);
    });
  });

  it("returns an empty map for an empty messageIds list (no query issued)", async () => {
    await withTestDb(async (db) => {
      const history = await trackingForMessages(db, [], SIG());
      expect(history.size).toBe(0);
    });
  });
});
