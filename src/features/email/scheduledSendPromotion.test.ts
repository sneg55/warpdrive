import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";
import { runSendJob } from "./worker";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedAccount(db: TestDb, userId: string, email: string): Promise<string> {
  const r = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return r.id;
}

async function seedSignature(db: TestDb, userId: string, bodyHtml: string): Promise<string> {
  const r = (
    await db.execute(
      sql`INSERT INTO signatures (user_id, name, body_html, is_default) VALUES (${userId}, 'Test Sig', ${bodyHtml}, true) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return r.id;
}

function decodeMimeBody(rawBase64url: string): string {
  const mimeText = Buffer.from(rawBase64url, "base64url").toString("utf-8");
  const afterHeaders = mimeText
    .split(/\r?\n\r?\n/)
    .slice(1)
    .join("");
  const bodyBase64 = afterHeaders.split(/\r?\n/).find((l) => l.length > 10) ?? "";
  return Buffer.from(bodyBase64, "base64").toString("utf-8");
}

describe("scheduled-send promotion: end-to-end (findings #1 and #2)", () => {
  it("promotes a due scheduled row: Gmail called once, CRM copy exists, tokens backfilled", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, {
        email: "promo-e2e@x.com",
        googleSub: "sub-promo-e2e",
      });
      const acctId = await seedAccount(db, user.id, "promo-e2e@x.com");
      const sigId = await seedSignature(db, user.id, "<p>-- Best, Eve</p>");

      const idempotencyKey = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      const future = new Date(Date.now() + 3_600_000);

      const setupFake = new FakeGmailClient();
      const scheduleResult = await sendEmail(db, {
        signal: AbortSignal.timeout(8000),
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: setupFake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey,
          to: ["recipient@example.com"],
          subject: "Scheduled E2E",
          bodyHtml: '<p>Hello <a href="https://example.com/promo">link</a></p>',
          signatureId: sigId,
          trackOpens: false,
          trackLinks: true,
          scheduledSendAt: future,
        },
      });
      expect(scheduleResult.ok).toBe(true);
      if (scheduleResult.ok) expect(scheduleResult.value.status).toBe("scheduled");
      expect(setupFake.calls.filter((c) => c.method === "sendRaw").length).toBe(0);

      await db.execute(
        sql`UPDATE email_send_attempts SET scheduled_at = now() - interval '1 second' WHERE account_id = ${acctId}`,
      );

      const workerFake = new FakeGmailClient();
      let capturedRaw = "";
      workerFake.sendImpl = (a: { rawBase64: string }) => {
        capturedRaw = a.rawBase64;
        return ok({ id: "gmail-promo-1", threadId: "thread-promo-1" });
      };

      const jobResult = await runSendJob(
        db,
        { accountId: acctId, idempotencyKey, signal: AbortSignal.timeout(8000) },
        { resolveClient: () => Promise.resolve(ok(workerFake)) },
      );
      expect(jobResult.ok).toBe(true);
      if (jobResult.ok) expect(jobResult.value.status).toBe("sent");

      const sendCalls = workerFake.calls.filter((c) => c.method === "sendRaw");
      expect(sendCalls.length).toBe(1);

      const body = decodeMimeBody(capturedRaw);
      expect(body).toContain("Best, Eve");
      expect(body).toContain("/t/click/");
      expect(body).not.toContain("https://example.com/promo");

      const msgRow = (
        await db.execute(
          sql`SELECT id, gmail_message_id FROM email_messages WHERE account_id = ${acctId}`,
        )
      ).rows[0] as { id: string; gmail_message_id: string } | undefined;
      expect(msgRow).toBeDefined();
      expect(msgRow?.gmail_message_id).toBe("gmail-promo-1");

      const tokenRows = (
        await db.execute(
          sql`SELECT message_id FROM email_tracking_tokens
              WHERE send_attempt_id = (
                SELECT id FROM email_send_attempts WHERE account_id = ${acctId}
              )`,
        )
      ).rows as { message_id: string | null }[];
      expect(tokenRows.length).toBeGreaterThan(0);
      for (const t of tokenRows) {
        expect(t.message_id).not.toBeNull();
        expect(t.message_id).toBe(msgRow?.id);
      }
    });
  });

  it("does NOT send a not-yet-due scheduled row when the worker runs early", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, {
        email: "promo-notdue@x.com",
        googleSub: "sub-promo-notdue",
      });
      const acctId = await seedAccount(db, user.id, "promo-notdue@x.com");

      const idempotencyKey = "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1";
      const future = new Date(Date.now() + 3_600_000);

      const setupFake = new FakeGmailClient();
      await sendEmail(db, {
        signal: AbortSignal.timeout(8000),
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: setupFake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey,
          to: ["r@example.com"],
          subject: "Not yet due",
          bodyHtml: "<p>Later</p>",
          trackOpens: false,
          trackLinks: false,
          scheduledSendAt: future,
        },
      });

      const workerFake = new FakeGmailClient();
      const jobResult = await runSendJob(
        db,
        { accountId: acctId, idempotencyKey, signal: AbortSignal.timeout(8000) },
        { resolveClient: () => Promise.resolve(ok(workerFake)) },
      );
      expect(jobResult.ok).toBe(false);
      expect(workerFake.calls.filter((c) => c.method === "sendRaw").length).toBe(0);
    });
  });
});
