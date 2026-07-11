// signatureSend.test.ts: real-DB tests for server-side signature appending (Task 4.3)
// RED: fails until sendEmailInput accepts signatureId and send.ts appends the body
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedAccount(db: Db, userId: string, email = "sender@example.com"): Promise<string> {
  const r = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return r.id;
}

async function seedSignature(
  db: Db,
  opts: { userId: string; bodyHtml: string; isDefault?: boolean },
): Promise<string> {
  const r = (
    await db.execute(sql`
      INSERT INTO signatures (user_id, name, body_html, is_default)
      VALUES (${opts.userId}, 'Test Sig', ${opts.bodyHtml}, ${opts.isDefault ?? false})
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return r.id;
}

describe("sendEmail with signatureId", () => {
  it("appends signature body_html to the outbound MIME body exactly once", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const accountId = await seedAccount(db, user.id);
      const sigId = await seedSignature(db, {
        userId: user.id,
        bodyHtml: "<p>-- Best, Alice</p>",
      });
      const gmail = new FakeGmailClient();

      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail,
        storage: new FakeStorageClient(),
        input: {
          accountId,
          idempotencyKey: "33333333-3333-3333-3333-333333333333",
          to: ["recipient@example.com"],
          subject: "Hello",
          bodyHtml: "<p>Body text</p>",
          signatureId: sigId,
          trackingEnabled: false,
        },
      });

      expect(r.ok).toBe(true);

      // Check the MIME message sent to the fake Gmail client.
      const sendCall = gmail.calls.find((c) => c.method === "sendRaw");
      expect(sendCall).toBeDefined();
      if (sendCall === undefined) return;

      // Decode the outer base64url envelope to get the raw MIME text.
      const rawArg = sendCall.args as { rawBase64: string };
      const mimeText = Buffer.from(rawArg.rawBase64, "base64url").toString("utf-8");

      // The MIME body part is inner-base64 encoded. Extract and decode it.
      // The body part follows a blank line after the Content-Transfer-Encoding header.
      const innerBase64 = mimeText
        .split(/\r?\n\r?\n/)
        .slice(1)
        .join("");
      // Remove MIME boundaries and line breaks to get the raw base64 body
      const bodyBase64 = innerBase64.split(/\r?\n/).find((l) => l.length > 10) ?? "";
      const bodyDecoded = Buffer.from(bodyBase64, "base64").toString("utf-8");

      // Body text AND signature must both appear in the decoded body
      expect(bodyDecoded).toContain("Body text");
      expect(bodyDecoded).toContain("Best, Alice");

      // The signature text must appear exactly once (not doubled)
      const occurrences = bodyDecoded.split("Best, Alice").length - 1;
      expect(occurrences).toBe(1);
    });
  });

  it("denies (E_PERM_004) when the signatureId belongs to a different user", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const other = await seedUser(db);
      const accountId = await seedAccount(db, user.id);
      const sigId = await seedSignature(db, {
        userId: other.id,
        bodyHtml: "<p>Other user sig</p>",
      });

      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: new FakeGmailClient(),
        storage: new FakeStorageClient(),
        input: {
          accountId,
          idempotencyKey: "44444444-4444-4444-4444-444444444444",
          to: ["recipient@example.com"],
          subject: "Hi",
          bodyHtml: "<p>Body</p>",
          signatureId: sigId,
          trackingEnabled: false,
        },
      });

      expect(r.ok).toBe(false);
      if (r.ok !== false) return;
      expect(r.error.id).toBe("E_PERM_004");
    });
  });

  // Item 5: signature links must NOT be rewritten to tracking redirects;
  // only authored-body links should be tokenised.
  it("does not rewrite signature links to tracking URLs while authored-body links are tracked", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const accountId = await seedAccount(db, user.id);
      const authoredLink = "https://authored-link.example.com/page";
      const sigLink = "https://signature-link.example.com/stable";
      const sigId = await seedSignature(db, {
        userId: user.id,
        bodyHtml: `<p>Cheers - <a href="${sigLink}">website</a></p>`,
      });
      const gmail = new FakeGmailClient();

      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail,
        storage: new FakeStorageClient(),
        input: {
          accountId,
          idempotencyKey: "66666666-6666-6666-6666-666666666666",
          to: ["recipient@example.com"],
          subject: "Tracked email",
          bodyHtml: `<p>Click here: <a href="${authoredLink}">link</a></p>`,
          signatureId: sigId,
          trackLinks: true,
        },
      });

      expect(r.ok).toBe(true);

      // The stored body_html in email_messages reflects bodyForCopy (authored + signature).
      const msgRow = (
        await db.execute(sql`SELECT body_html FROM email_messages ORDER BY created_at DESC LIMIT 1`)
      ).rows[0] as { body_html: string } | undefined;
      expect(msgRow).toBeDefined();
      if (msgRow === undefined) return;
      const stored = msgRow.body_html;

      // The authored link must have been rewritten to a /t/click/ tracking URL.
      expect(stored).toContain("/t/click/");
      expect(stored).not.toContain(authoredLink);

      // The signature link must remain as its original stable href.
      expect(stored).toContain(sigLink);
    });
  });

  it("sends normally when no signatureId is provided", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const accountId = await seedAccount(db, user.id);

      const r = await sendEmail(db, {
        actorId: user.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: new FakeGmailClient(),
        storage: new FakeStorageClient(),
        input: {
          accountId,
          idempotencyKey: "55555555-5555-5555-5555-555555555555",
          to: ["recipient@example.com"],
          subject: "No sig",
          bodyHtml: "<p>Plain body</p>",
          trackingEnabled: false,
        },
      });

      expect(r.ok).toBe(true);
    });
  });
});
