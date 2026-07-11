// Real-DB integration test for attachment send (Task 6.1 / Phase 6).
// Uses storageFake for file bytes, gmailFake for send assertions.
// Do NOT mock the database; all writes hit the real test Postgres.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { seedAccount, seedReadyFile } from "./attachmentSend.helpers";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";

describe("sendEmail with attachments (Task 6.1)", () => {
  it("zero attachments keeps the current single-part MIME (no multipart/mixed)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-zero-attach", threadId: "th-1" });
      fake.messages.set("g-zero-attach", { id: "g-zero-attach", threadId: "th-1", labelIds: [] });

      const storage = new FakeStorageClient();

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage,
        input: {
          accountId: acctId,
          idempotencyKey: "a1a1a1a1-0000-0000-0000-000000000001",
          to: ["you@y.com"],
          subject: "No attachments",
          bodyHtml: "<p>hello</p>",
          trackingEnabled: false,
          attachments: [],
        },
      });

      expect(r.ok).toBe(true);

      const sendCall = fake.calls.find((c) => c.method === "sendRaw");
      expect(sendCall).toBeDefined();
      const rawArg = (sendCall?.args as { rawBase64: string }).rawBase64;
      const decoded = Buffer.from(rawArg, "base64url").toString("utf8");

      expect(decoded).not.toContain("multipart/mixed");
      expect(decoded).toContain("Content-Type: text/html");
    });
  });

  it("one attachment produces multipart/mixed with the file part (filename + content-type + base64 bytes)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "attach-owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "attach-owner@gunsnation.com");

      const { randomUUID } = await import("node:crypto");
      const personId = randomUUID();
      await db.execute(sql`
        INSERT INTO persons (id, name, owner_id, visibility_level)
        VALUES (${personId}, 'Test Person', ${owner.id}, 'all')
      `);

      const storage = new FakeStorageClient();
      const fakeContent = Buffer.from("fake-pdf-bytes");
      const { fileId } = await seedReadyFile(db, {
        uploadedBy: owner.id,
        entityType: "person",
        entityId: personId,
        filename: "invoice.pdf",
        contentType: "application/pdf",
        content: fakeContent,
        storage,
      });

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-one-attach", threadId: "th-2" });
      fake.messages.set("g-one-attach", { id: "g-one-attach", threadId: "th-2", labelIds: [] });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage,
        input: {
          accountId: acctId,
          idempotencyKey: "b2b2b2b2-0000-0000-0000-000000000002",
          to: ["recipient@y.com"],
          subject: "Email with attachment",
          bodyHtml: "<p>see attached</p>",
          trackingEnabled: false,
          attachments: [{ fileId }],
        },
      });

      expect(r.ok).toBe(true);

      const sendCall = fake.calls.find((c) => c.method === "sendRaw");
      expect(sendCall).toBeDefined();
      const rawArg = (sendCall?.args as { rawBase64: string }).rawBase64;
      const decoded = Buffer.from(rawArg, "base64url").toString("utf8");

      expect(decoded).toContain("multipart/mixed");
      expect(decoded).toContain("Content-Type: text/html");
      expect(decoded).toContain("Content-Type: application/pdf");
      expect(decoded).toContain('filename="invoice.pdf"');
      expect(decoded).toContain("Content-Disposition: attachment");
      expect(decoded).toContain("Content-Transfer-Encoding: base64");
      expect(decoded).toContain(fakeContent.toString("base64"));
    });
  });

  it("an attachment not readable by the actor fails the send with E_GMAIL_012", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-perm@gunsnation.com" });
      const attacker = await seedUser(db, { email: "attacker@gunsnation.com" });
      const attackerAcctId = await seedAccount(db, attacker.id, "attacker@gunsnation.com");

      const { randomUUID } = await import("node:crypto");
      const personId = randomUUID();
      await db.execute(sql`
        INSERT INTO persons (id, name, owner_id, visibility_level)
        VALUES (${personId}, 'Owner Person', ${owner.id}, 'owner')
      `);

      const storage = new FakeStorageClient();
      const { fileId } = await seedReadyFile(db, {
        uploadedBy: owner.id,
        entityType: "person",
        entityId: personId,
        filename: "secret.pdf",
        contentType: "application/pdf",
        content: Buffer.from("secret"),
        storage,
      });

      const fake = new FakeGmailClient();
      const r = await sendEmail(db, {
        actorId: attacker.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage,
        input: {
          accountId: attackerAcctId,
          idempotencyKey: "c3c3c3c3-0000-0000-0000-000000000003",
          to: ["victim@y.com"],
          subject: "Trying to steal a file",
          bodyHtml: "<p>gotcha</p>",
          trackingEnabled: false,
          attachments: [{ fileId }],
        },
      });

      expect(r.ok).toBe(false);
      if (!r.ok) {
        // Attachment denial uses E_GMAIL_012 (not a generic perm error) so the error
        // surface does not reveal whether the fileId exists to the caller.
        expect(r.error.id).toBe("E_GMAIL_012");
      }
      expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(0);
    });
  });
});
