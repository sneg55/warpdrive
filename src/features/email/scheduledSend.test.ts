import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { claim } from "./outboxClaim";
import { sendEmail } from "./send";

describe("scheduled_at column", () => {
  it("persists scheduled_at on an attempt row", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('sched-col@x.com','SC','sub-sc') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctRow = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'sched-col@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctId: string = acctRow.id;
      const future = new Date(Date.now() + 3_600_000); // 1 hour from now
      const idempotencyKey = "33333333-3333-3333-3333-333333333333";
      const msgId = "<test-sched-1@example.com>";
      const payload = JSON.stringify({ to: ["x@y.com"], subject: "S", html: "<p>hi</p>" });
      // Pass all dynamic values as parameters; avoid inline literals mixed with params.
      await db.execute(
        sql`INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload, status, scheduled_at) SELECT ${idempotencyKey}::uuid, ${msgId}, ${acctId}::uuid, ${payload}::jsonb, 'pending', ${future}`,
      );
      const row = (
        await db.execute(
          sql`SELECT scheduled_at FROM email_send_attempts WHERE account_id=${acctId}::uuid`,
        )
      ).rows[0] as { scheduled_at: string | null };
      expect(row.scheduled_at).not.toBeNull();
    });
  });
});

describe("sendEmail with scheduledSendAt", () => {
  it("stores scheduled_at and does NOT call Gmail when scheduledSendAt is in the future", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { email: "sched2@x.com", googleSub: "sub-sched2" });
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${user.id},'sched2@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const fake = new FakeGmailClient();
      const future = new Date(Date.now() + 3_600_000);
      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acct.id,
          idempotencyKey: "44444444-4444-4444-4444-444444444444",
          to: ["you@y.com"],
          subject: "Scheduled",
          bodyHtml: "<p>later</p>",
          trackOpens: false,
          trackLinks: false,
          scheduledSendAt: future,
        },
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe("scheduled");
      const sendCalls = fake.calls.filter((c) => c.method === "sendRaw");
      expect(sendCalls.length).toBe(0);
      // Verify scheduled_at was persisted
      const row = (
        await db.execute(
          sql`SELECT scheduled_at FROM email_send_attempts WHERE account_id=${acct.id}`,
        )
      ).rows[0] as { scheduled_at: string | null };
      expect(row.scheduled_at).not.toBeNull();
    });
  });
});

describe("outboxClaim: scheduled_at due filter", () => {
  it("does NOT claim a row whose scheduled_at is in the future", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('sched3@x.com','S3','sub-s3') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'sched3@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const future = new Date(Date.now() + 3_600_000);
      const row = (
        await db.execute(sql`
        INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload, status, scheduled_at)
        VALUES ('55555555-5555-5555-5555-555555555555','<sched3@example.com>',${acct.id},'{"to":["x@y.com"],"subject":"S","html":"<p>hi</p>"}'::jsonb,'pending',${future})
        RETURNING id
      `)
      ).rows[0] as { id: string };
      const signal = new AbortController().signal;
      const token = await claim(db, row.id, signal);
      expect(token).toBeNull(); // not claimable yet
    });
  });

  it("claims a row whose scheduled_at is in the past (due)", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('sched4@x.com','S4','sub-s4') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'sched4@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const past = new Date(Date.now() - 60_000); // 1 minute ago
      const row = (
        await db.execute(sql`
        INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload, status, scheduled_at)
        VALUES ('66666666-6666-6666-6666-666666666666','<sched4@example.com>',${acct.id},'{"to":["x@y.com"],"subject":"S","html":"<p>hi</p>"}'::jsonb,'pending',${past})
        RETURNING id
      `)
      ).rows[0] as { id: string };
      const signal = new AbortController().signal;
      const token = await claim(db, row.id, signal);
      expect(token).not.toBeNull(); // past due: claimable
    });
  });

  it("claims a row with NULL scheduled_at (unscheduled/immediate)", async () => {
    await withTestDb(async (db) => {
      const u = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('sched5@x.com','S5','sub-s5') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'sched5@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const row = (
        await db.execute(sql`
        INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload, status)
        VALUES ('77777777-7777-7777-7777-777777777777','<sched5@example.com>',${acct.id},'{"to":["x@y.com"],"subject":"S","html":"<p>hi</p>"}'::jsonb,'pending')
        RETURNING id
      `)
      ).rows[0] as { id: string };
      const signal = new AbortController().signal;
      const token = await claim(db, row.id, signal);
      expect(token).not.toBeNull(); // NULL scheduled_at: always claimable
    });
  });
});
