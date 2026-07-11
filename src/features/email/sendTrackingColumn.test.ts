// Real-DB tests: tracking_enabled column is written correctly when the Composer
// sends trackOpens/trackLinks without a legacy trackingEnabled field.
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
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'owner@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("sendEmail tracking_enabled column", () => {
  // CRITICAL: the Composer now sends trackOpens/trackLinks and never trackingEnabled.
  // tracking_enabled in email_messages must be true when either open or link tracking is on.
  it("persists tracking_enabled=true when trackOpens=true and trackLinks=false (no trackingEnabled)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-trk-1", threadId: "th-trk" });
      fake.messages.set("g-trk-1", { id: "g-trk-1", threadId: "th-trk", labelIds: [] });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          to: ["you@y.com"],
          subject: "Tracking test",
          bodyHtml: "<p>hi</p>",
          trackOpens: true,
          trackLinks: false,
          // trackingEnabled intentionally omitted (new Composer path)
        },
      });
      expect(r.ok).toBe(true);

      const row = (
        await db.execute(
          sql`SELECT tracking_enabled FROM email_messages WHERE account_id=${acctId} AND gmail_message_id='g-trk-1'`,
        )
      ).rows[0] as { tracking_enabled: boolean } | undefined;
      expect(row).toBeDefined();
      expect(row!.tracking_enabled).toBe(true);
    });
  });

  it("persists tracking_enabled=false when trackOpens=false and trackLinks=false", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-trk-2", threadId: "th-trk2" });
      fake.messages.set("g-trk-2", { id: "g-trk-2", threadId: "th-trk2", labelIds: [] });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          to: ["you@y.com"],
          subject: "No tracking",
          bodyHtml: "<p>hi</p>",
          trackOpens: false,
          trackLinks: false,
          // trackingEnabled intentionally omitted
        },
      });
      expect(r.ok).toBe(true);

      const row = (
        await db.execute(
          sql`SELECT tracking_enabled FROM email_messages WHERE account_id=${acctId} AND gmail_message_id='g-trk-2'`,
        )
      ).rows[0] as { tracking_enabled: boolean } | undefined;
      expect(row).toBeDefined();
      expect(row!.tracking_enabled).toBe(false);
    });
  });
});
