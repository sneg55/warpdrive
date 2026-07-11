import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail, sendEmailInput } from "./send";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedAccount(db: TestDb, ownerId: string): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'owner@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("bcc", () => {
  it("sendEmailInput accepts bcc array", () => {
    expect(() =>
      sendEmailInput.parse({
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        to: ["r@x.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: false,
        bcc: ["bcc@x.com"],
      }),
    ).not.toThrow();
  });

  it("bcc recipient appears in sent MIME headers", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-bcc-1", threadId: "th-bcc" });
      fake.messages.set("g-bcc-1", { id: "g-bcc-1", threadId: "th-bcc", labelIds: [] });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          to: ["to@x.com"],
          bcc: ["bcc@x.com"],
          subject: "BCC Test",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
        },
      });
      expect(r.ok).toBe(true);

      const sendCall = fake.calls.find((c) => c.method === "sendRaw");
      expect(sendCall).toBeDefined();
      const args = sendCall!.args as { rawBase64: string };
      const mime = Buffer.from(args.rawBase64, "base64url").toString("utf8");
      expect(mime).toContain("Bcc: bcc@x.com");
    });
  });
});
