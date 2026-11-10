import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";
import { seedAccount } from "./send.test-helpers";

it("rejects sending from a mailbox the actor does not own (E_PERM)", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner@gunsnation.com" });
    const other = await seedUser(db, { email: "other@gunsnation.com" });
    const acctId = await seedAccount(db, owner.id, AbortSignal.timeout(8000));

    const r = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: other.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: new FakeGmailClient(),
      storage: new FakeStorageClient(),
      input: {
        accountId: acctId,
        idempotencyKey: "22222222-2222-2222-2222-222222222222",
        to: ["you@y.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: false,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id.startsWith("E_PERM")).toBe(true);
  });
});

it("rejects an unknown mailbox identically (no existence leak)", async () => {
  await withTestDb(async (db) => {
    const actor = await seedUser(db, { email: "a@gunsnation.com" });
    const r = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: actor.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: new FakeGmailClient(),
      storage: new FakeStorageClient(),
      input: {
        accountId: "00000000-0000-0000-0000-0000000000aa",
        idempotencyKey: "22222222-2222-2222-2222-222222222222",
        to: ["you@y.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: false,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_PERM_001");
  });
});

it("sends, stores the outbound copy, and backfills tracking tokens", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner@gunsnation.com" });
    const acctId = await seedAccount(db, owner.id, AbortSignal.timeout(8000));

    const fake = new FakeGmailClient();
    fake.sendImpl = () => ok({ id: "g-out-1", threadId: "th-1" });
    fake.messages.set("g-out-1", {
      id: "g-out-1",
      threadId: "th-1",
      labelIds: [],
      snippet: "preview",
    });

    const r = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input: {
        accountId: acctId,
        idempotencyKey: "33333333-3333-3333-3333-333333333333",
        to: ["you@y.com"],
        subject: "Hi",
        bodyHtml: '<a href="https://x.com">x</a>',
        trackingEnabled: true,
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("sent");

    const msg = (
      await db.execute(
        sql`SELECT gmail_message_id, direction, from_email, body_html FROM email_messages WHERE account_id=${acctId}`,
      )
    ).rows[0] as {
      gmail_message_id: string;
      direction: string;
      from_email: string;
      body_html: string | null;
    };
    expect(msg.gmail_message_id).toBe("g-out-1");
    expect(msg.direction).toBe("outbound");
    expect(msg.from_email).toBe("owner@gunsnation.com");
    expect(msg.body_html).toContain("/t/click/");

    const tok = (
      await db.execute(sql`
          SELECT message_id FROM email_tracking_tokens
          WHERE message_id IS NOT NULL
            AND send_attempt_id IN (
              SELECT id FROM email_send_attempts
              WHERE account_id=${acctId} AND idempotency_key='33333333-3333-3333-3333-333333333333'
            )
        `)
    ).rows;
    expect(tok.length).toBeGreaterThan(0);
  });
});
