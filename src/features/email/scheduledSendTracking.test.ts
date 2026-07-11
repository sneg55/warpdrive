// Fix #2 real-DB tests: a scheduled send must apply the SAME body preparation as an
// immediate send (append signature, mint tracking tokens, rewrite links) and persist the
// prepared payload; the worker then sends the stored payload unchanged. Split out of
// scheduledSend.test.ts to stay under the line cap.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { processSendAttempt } from "./outbox";
import { sendEmail } from "./send";

type SchedDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedAccountFor(db: SchedDb, userId: string, email: string): Promise<string> {
  const r = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return r.id;
}

async function seedSignatureFor(db: SchedDb, userId: string, bodyHtml: string): Promise<string> {
  const r = (
    await db.execute(
      sql`INSERT INTO signatures (user_id, name, body_html, is_default) VALUES (${userId}, 'Sched Sig', ${bodyHtml}, true) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return r.id;
}

// The MIME body part is inner-base64 encoded (Content-Transfer-Encoding: base64). Decode
// it back to the authored HTML so assertions run against the real body text (mirrors
// signatureSend.test.ts). The header block precedes the first blank line.
function decodeMimeBody(mimeText: string): string {
  const afterHeaders = mimeText
    .split(/\r?\n\r?\n/)
    .slice(1)
    .join("");
  const bodyBase64 = afterHeaders.split(/\r?\n/).find((l) => l.length > 10) ?? "";
  return Buffer.from(bodyBase64, "base64").toString("utf-8");
}

describe("scheduled send bakes tracking + signature into the stored payload (fix #2)", () => {
  it("a PAST (due) scheduled send calls Gmail once with the signature and a rewritten tracked link", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { email: "sched-due@x.com", googleSub: "sub-sd" });
      const acctId = await seedAccountFor(db, user.id, "sched-due@x.com");
      const sigId = await seedSignatureFor(db, user.id, "<p>-- Regards, Bob</p>");

      const fake = new FakeGmailClient();
      let capturedMime = "";
      fake.sendImpl = (a: { rawBase64: string }) => {
        capturedMime = Buffer.from(a.rawBase64, "base64url").toString("utf-8");
        return ok({ id: "sent-due-1", threadId: "t1" });
      };

      // scheduled_at in the PAST => due => runSend proceeds to an immediate send,
      // but still prepares the body first.
      const past = new Date(Date.now() - 60_000);
      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          to: ["you@y.com"],
          subject: "Due scheduled",
          bodyHtml: '<p>Body <a href="https://example.com/x">link</a></p>',
          signatureId: sigId,
          trackOpens: false,
          trackLinks: true,
          scheduledSendAt: past,
        },
      });
      expect(r.ok).toBe(true);

      // (a) Gmail sendRaw called exactly once.
      const sendCalls = fake.calls.filter((c) => c.method === "sendRaw");
      expect(sendCalls.length).toBe(1);
      const body = decodeMimeBody(capturedMime);
      // (b) the sent MIME body contains the appended signature.
      expect(body).toContain("Regards, Bob");
      // (c) a tracked link is rewritten to a tracking URL; the original href is gone.
      expect(body).toContain("/t/click/");
      expect(body).not.toContain("https://example.com/x");
    });
  });

  it("a FUTURE scheduled send does NOT call Gmail but persists the prepared (signed + rewritten) payload", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { email: "sched-fut@x.com", googleSub: "sub-sf" });
      const acctId = await seedAccountFor(db, user.id, "sched-fut@x.com");
      const sigId = await seedSignatureFor(db, user.id, "<p>-- Thanks, Carol</p>");

      const fake = new FakeGmailClient();
      const future = new Date(Date.now() + 3_600_000);
      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          to: ["y@y.com"],
          subject: "Future scheduled",
          bodyHtml: '<p>Hi <a href="https://example.com/y">link</a></p>',
          signatureId: sigId,
          trackOpens: false,
          trackLinks: true,
          scheduledSendAt: future,
        },
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe("scheduled");

      // Gmail was NOT called for a future send.
      expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(0);

      // The persisted payload already carries the signature and the rewritten link.
      const row = (
        await db.execute(sql`SELECT payload FROM email_send_attempts WHERE account_id=${acctId}`)
      ).rows[0] as { payload: { html: string } };
      expect(row.payload.html).toContain("Thanks, Carol");
      expect(row.payload.html).toContain("/t/click/");
      expect(row.payload.html).not.toContain("https://example.com/y");
    });
  });

  it("the worker (processSendAttempt) sends a due scheduled row unchanged: sig + rewritten link in MIME", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { email: "sched-wrk@x.com", googleSub: "sub-swk" });
      const acctId = await seedAccountFor(db, user.id, "sched-wrk@x.com");
      const sigId = await seedSignatureFor(db, user.id, "<p>-- Best, Dana</p>");

      const fake = new FakeGmailClient();
      let capturedMime = "";
      fake.sendImpl = (a: { rawBase64: string }) => {
        capturedMime = Buffer.from(a.rawBase64, "base64url").toString("utf-8");
        return ok({ id: "sent-wrk-1", threadId: "t1" });
      };

      // Enqueue as a FUTURE send: body is prepared + persisted, Gmail not called yet.
      const key = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      const future = new Date(Date.now() + 3_600_000);
      await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: key,
          to: ["z@z.com"],
          subject: "Worker scheduled",
          bodyHtml: '<p>Yo <a href="https://example.com/z">link</a></p>',
          signatureId: sigId,
          trackOpens: false,
          trackLinks: true,
          scheduledSendAt: future,
        },
      });
      expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(0);

      // Make the row due, then run the worker path.
      await db.execute(
        sql`UPDATE email_send_attempts SET scheduled_at = now() - interval '1 second' WHERE account_id=${acctId}`,
      );
      const signal = new AbortController().signal;
      const outcome = await processSendAttempt(db, {
        accountId: acctId,
        idempotencyKey: key,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value.status).toBe("sent");

      // Gmail called exactly once, with the already-prepared payload.
      expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(1);
      const body = decodeMimeBody(capturedMime);
      expect(body).toContain("Best, Dana");
      expect(body).toContain("/t/click/");
      expect(body).not.toContain("https://example.com/z");
    });
  });
});
