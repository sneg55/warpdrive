import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";
import { seedAccount, ToggleGetMessageFake } from "./send.test-helpers";

it("is idempotent: a replay of an already-sent attempt does not re-send", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner@gunsnation.com" });
    const acctId = await seedAccount(db, owner.id, AbortSignal.timeout(8000));

    const fake = new FakeGmailClient();
    fake.sendImpl = () => ok({ id: "g-out-1", threadId: "th-1" });
    fake.messages.set("g-out-1", { id: "g-out-1", threadId: "th-1", labelIds: [], snippet: "p" });

    const input = {
      accountId: acctId,
      idempotencyKey: "44444444-4444-4444-4444-444444444444",
      to: ["you@y.com"],
      subject: "Hi",
      bodyHtml: "<p>hi</p>",
      trackingEnabled: false,
    };
    const r1 = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input,
    });
    expect(r1.ok).toBe(true);
    const sendsAfterFirst = fake.calls.filter((c) => c.method === "sendRaw").length;

    const r2 = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.status).toBe("sent");
      expect(r2.value.messageId).toBe("g-out-1");
    }
    expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(sendsAfterFirst);
  });
});

it("replay repairs a missing local copy after a post-accept failure", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner@gunsnation.com" });
    const acctId = await seedAccount(db, owner.id, AbortSignal.timeout(8000));

    const fake = new ToggleGetMessageFake();
    fake.sendImpl = () => ok({ id: "g-out-9", threadId: "th-9" });
    fake.messages.set("g-out-9", { id: "g-out-9", threadId: "th-9", labelIds: [], snippet: "p" });
    const input = {
      accountId: acctId,
      idempotencyKey: "55555555-5555-5555-5555-555555555555",
      to: ["you@y.com"],
      subject: "Hi",
      bodyHtml: "<p>hi</p>",
      trackingEnabled: false,
    };

    fake.failGetMessage = true;
    const r1 = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input,
    });
    expect(r1.ok).toBe(false);
    const sendsAfterFirst = fake.calls.filter((c) => c.method === "sendRaw").length;

    const before = (await db.execute(sql`SELECT id FROM email_messages WHERE account_id=${acctId}`))
      .rows;
    expect(before.length).toBe(0);

    fake.failGetMessage = false;
    const r2 = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.messageId).toBe("g-out-9");

    const after = (
      await db.execute(
        sql`SELECT gmail_message_id, direction FROM email_messages WHERE account_id=${acctId}`,
      )
    ).rows as { gmail_message_id: string; direction: string }[];
    expect(after.length).toBe(1);
    expect(after[0]!.gmail_message_id).toBe("g-out-9");
    expect(after[0]!.direction).toBe("outbound");

    expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(sendsAfterFirst);
  });
});
