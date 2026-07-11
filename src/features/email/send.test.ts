import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { err, ok, type Result } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";
import { sendEmail, sendEmailInput } from "./send";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// A fake whose getMessage can be toggled to fail. storeOutboundCopy calls getMessage to
// learn the gmail threadId, so a failing getMessage models "Gmail accepted the send
// (attempt marked sent) but the local-copy step failed" (F17).
class ToggleGetMessageFake extends FakeGmailClient {
  failGetMessage = false;
  override getMessage(a: {
    id: string;
    signal: AbortSignal;
  }): Promise<Result<GmailMessage, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "getMessage", args: a });
    if (this.failGetMessage) {
      return Promise.resolve(err(new AppError("E_GMAIL_003", "getMessage failed", {})));
    }
    const msg = this.messages.get(a.id);
    return Promise.resolve(ok(msg ?? { id: a.id, threadId: "t1", labelIds: [] }));
  }
}

async function seedAccount(
  db: TestDb,
  ownerId: string,
  email = "owner@gunsnation.com",
): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("sendEmail", () => {
  it("rejects sending from a mailbox the actor does not own (E_PERM)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const other = await seedUser(db, { email: "other@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const r = await sendEmail(db, {
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
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-out-1", threadId: "th-1" });
      // getMessage on the adopted id must yield the gmail threadId for the CRM copy.
      fake.messages.set("g-out-1", {
        id: "g-out-1",
        threadId: "th-1",
        labelIds: [],
        snippet: "preview",
      });

      const r = await sendEmail(db, {
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
      // The stored body is the tracking-rewritten html (href points to the click URL).
      expect(msg.body_html).toContain("/t/click/");

      // Tokens were backfilled with the message id. Scope to THIS send's attempt so the
      // assertion is not a vacuous global scan under parallel test runs.
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

  it("is idempotent: a replay of an already-sent attempt does not re-send", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

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
        // The replay returns the SAME stored gmail message id, not a fresh one.
        expect(r2.value.messageId).toBe("g-out-1");
      }
      // No second sendRaw: the replay short-circuits.
      expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(sendsAfterFirst);
    });
  });

  // F17: if Gmail accepted the send (attempt marked sent) but the local copy step failed,
  // a later replay must repair the local state, not report success while email_messages
  // stays empty forever. The repair is idempotent and must NOT re-send to Gmail.
  it("replay repairs a missing local copy after a post-accept failure", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

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

      // First attempt: Gmail accepts (sendRaw ok) but storeOutboundCopy fails on getMessage.
      fake.failGetMessage = true;
      const r1 = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input,
      });
      expect(r1.ok).toBe(false);
      const sendsAfterFirst = fake.calls.filter((c) => c.method === "sendRaw").length;

      // The attempt is marked sent with the gmail id, but NO local copy exists yet.
      const before = (
        await db.execute(sql`SELECT id FROM email_messages WHERE account_id=${acctId}`)
      ).rows;
      expect(before.length).toBe(0);

      // Replay: getMessage now works. The repair must create the local copy...
      fake.failGetMessage = false;
      const r2 = await sendEmail(db, {
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

      // ...WITHOUT re-sending to Gmail (exactly-once preserved).
      expect(fake.calls.filter((c) => c.method === "sendRaw").length).toBe(sendsAfterFirst);
    });
  });
});

describe("sendEmailInput schema recipient validation", () => {
  const base = {
    accountId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    subject: "hi",
    bodyHtml: "<p>hi</p>",
  };

  it("rejects a malformed recipient address", () => {
    expect(sendEmailInput.safeParse({ ...base, to: ["not-an-email"] }).success).toBe(false);
  });

  it("rejects a malformed cc address", () => {
    expect(sendEmailInput.safeParse({ ...base, to: ["a@b.com"], cc: ["bad"] }).success).toBe(false);
  });

  it("accepts valid recipient addresses", () => {
    expect(sendEmailInput.safeParse({ ...base, to: ["a@b.com"] }).success).toBe(true);
  });
});
