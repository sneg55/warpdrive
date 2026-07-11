import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { sendEmailInput } from "./send";
import { mintTokensForSend } from "./tracking";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

async function seedAttempt(db: TestDb): Promise<{ attemptId: string }> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('split@gunsnation.com','S','sub-s') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'split@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const att = (
    await db.execute(sql`
      INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload)
      VALUES (gen_random_uuid(), 'h-split', ${acct.id}, '{}'::jsonb) RETURNING id
    `)
  ).rows[0] as { id: string };
  return { attemptId: att.id };
}

describe("trackingSplit", () => {
  it("sendEmailInput accepts trackOpens and trackLinks", () => {
    expect(() =>
      sendEmailInput.parse({
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        to: ["r@x.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackOpens: true,
        trackLinks: false,
      }),
    ).not.toThrow();
  });

  it("trackOpens=true trackLinks=false yields open token only", async () => {
    await withTestDb(async (db) => {
      const { attemptId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "r@x.com",
        links: ["https://a.com"],
        trackOpens: true,
        trackLinks: false,
        signal: newSignal(),
      });
      expect(out.openToken).not.toBeNull();
      expect(out.linkTokens).toHaveLength(0);
    });
  });

  it("trackOpens=false trackLinks=true yields link tokens only", async () => {
    await withTestDb(async (db) => {
      const { attemptId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "r@x.com",
        links: ["https://b.com"],
        trackOpens: false,
        trackLinks: true,
        signal: newSignal(),
      });
      expect(out.openToken).toBeNull();
      expect(out.linkTokens).toHaveLength(1);
    });
  });

  it("sendEmailInput back-compat: trackingEnabled alone still works", () => {
    expect(() =>
      sendEmailInput.parse({
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        to: ["r@x.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: true,
      }),
    ).not.toThrow();
  });
});
