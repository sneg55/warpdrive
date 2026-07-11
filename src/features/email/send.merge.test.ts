import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedAccount(db: TestDb, ownerId: string): Promise<string> {
  return (
    (
      await db.execute(
        sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'owner@gunsnation.com') RETURNING id`,
      )
    ).rows[0] as { id: string }
  ).id;
}

// Regression: templates carried {{person.name}}-style merge tokens but applyMergeFields was never
// wired into the send path, so recipients received the raw {{token}} text. A send now substitutes
// tokens in the subject and body from the recipient's visible contact before delivery.
describe("sendEmail merge fields", () => {
  it("substitutes {{merge}} tokens in subject and body from the recipient's contact", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await db.execute(sql`
        INSERT INTO persons (name, first_name, last_name, primary_email, owner_id, visibility_level)
        VALUES ('Sofia Ramirez','Sofia','Ramirez','you@corp.com', ${owner.id}, 'all')
      `);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-out-1", threadId: "th-1" });
      fake.messages.set("g-out-1", { id: "g-out-1", threadId: "th-1", labelIds: [], snippet: "p" });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "44444444-4444-4444-4444-444444444444",
          to: ["you@corp.com"],
          subject: "Proposal for {{person.name}}",
          bodyHtml: "<p>Hi {{person.first_name}}, welcome.</p>",
          trackingEnabled: false,
        },
      });
      expect(r.ok).toBe(true);

      const msg = (
        await db.execute(
          sql`SELECT subject, body_html FROM email_messages WHERE account_id=${acctId}`,
        )
      ).rows[0] as { subject: string; body_html: string | null };
      expect(msg.subject).toBe("Proposal for Sofia Ramirez");
      expect(msg.body_html).toContain("Hi Sofia, welcome.");
      expect(msg.body_html).not.toContain("{{");
    });
  });

  it("does NOT resolve a recipient-derived person token for a multi-recipient send (no cross-recipient leak)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      await db.execute(sql`
        INSERT INTO persons (name, first_name, last_name, primary_email, owner_id, visibility_level)
        VALUES ('Sofia Ramirez','Sofia','Ramirez','you@corp.com', ${owner.id}, 'all')
      `);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-out-3", threadId: "th-3" });
      fake.messages.set("g-out-3", { id: "g-out-3", threadId: "th-3", labelIds: [], snippet: "p" });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "66666666-6666-6666-6666-666666666666",
          // Sofia is the FIRST recipient; a second recipient must not see her merged into the body.
          to: ["you@corp.com", "second@elsewhere.com"],
          subject: "Hi {{person.first_name}}",
          bodyHtml: "<p>Hello {{person.name}}.</p>",
          trackingEnabled: false,
        },
      });
      expect(r.ok).toBe(true);

      const msg = (
        await db.execute(
          sql`SELECT subject, body_html FROM email_messages WHERE account_id=${acctId}`,
        )
      ).rows[0] as { subject: string; body_html: string | null };
      // Person tokens blank out for a multi-recipient send instead of leaking Sofia's data.
      expect(msg.subject).toBe("Hi ");
      expect(msg.body_html).not.toContain("Sofia");
      expect(msg.body_html).not.toContain("{{");
    });
  });

  it("renders unknown tokens as empty rather than leaking raw {{token}} to the recipient", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-out-2", threadId: "th-2" });
      fake.messages.set("g-out-2", { id: "g-out-2", threadId: "th-2", labelIds: [], snippet: "p" });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "55555555-5555-5555-5555-555555555555",
          to: ["stranger@nowhere.com"],
          subject: "Hi {{person.first_name}}",
          bodyHtml: "<p>Hello {{person.name}}.</p>",
          trackingEnabled: false,
        },
      });
      expect(r.ok).toBe(true);

      const msg = (
        await db.execute(
          sql`SELECT subject, body_html FROM email_messages WHERE account_id=${acctId}`,
        )
      ).rows[0] as { subject: string; body_html: string | null };
      expect(msg.subject).toBe("Hi ");
      expect(msg.body_html).not.toContain("{{");
    });
  });
});
