import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import type { SendPayload } from "./outboxClaim";
import { sendEmail } from "./send";
import { ensureLocalCopyForReplay } from "./sendReplayRepair";
import { runSendJob } from "./worker";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// C1 + the three-send-path trap: the composer's privacy pick rides sendEmailInput.visibility, is
// persisted in the outbox payload, and MUST be honored by all three CRM-copy reconstruction sites,
// or a scheduled/replayed "private" email silently ships as a shared thread. One test per path
// asserts a "private" compose lands email_threads.visibility='private'.
async function seedAccount(db: TestDb, ownerId: string, email: string): Promise<string> {
  return (
    (
      await db.execute(
        sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
      )
    ).rows[0] as { id: string }
  ).id;
}

async function threadVisibility(
  db: TestDb,
  accountId: string,
  gmailThreadId: string,
): Promise<string | undefined> {
  const row = (
    await db.execute(sql`
      SELECT visibility FROM email_threads
      WHERE account_id=${accountId} AND gmail_thread_id=${gmailThreadId}
    `)
  ).rows[0] as { visibility: string } | undefined;
  return row?.visibility;
}

// Enqueue a scheduled send, back-date it so it is due, then deliver via the worker send handler
// (the same handler the delayed pg-boss job fires). Mirrors send.linkDeal.scheduled.test.ts.
async function deliverScheduled(
  db: TestDb,
  args: { accountId: string; idempotencyKey: string; workerFake: FakeGmailClient },
): Promise<void> {
  await db.execute(
    sql`UPDATE email_send_attempts SET scheduled_at = now() - interval '1 second' WHERE account_id = ${args.accountId} AND idempotency_key = ${args.idempotencyKey}`,
  );
  const jobResult = await runSendJob(
    db,
    {
      accountId: args.accountId,
      idempotencyKey: args.idempotencyKey,
      signal: AbortSignal.timeout(8000),
    },
    { resolveClient: () => Promise.resolve(ok(args.workerFake)) },
  );
  expect(jobResult.ok).toBe(true);
  if (jobResult.ok) expect(jobResult.value.status).toBe("sent");
}

// Insert a sent attempt whose local copy was never stored (crash between markSent and
// storeOutboundCopy), standing in for a replay to repair. Mirrors sendReplayRepair.test.ts.
async function seedSentAttempt(
  db: TestDb,
  args: { accountId: string; gmailMessageId: string; payload: SendPayload },
): Promise<string> {
  const idempotencyKey = crypto.randomUUID();
  const messageIdHeader = `${crypto.randomUUID()}@gunsnation.com`;
  return (
    (
      await db.execute(sql`
        INSERT INTO email_send_attempts
          (idempotency_key, message_id_header, account_id, payload, status, gmail_message_id, sent_at)
        VALUES
          (${idempotencyKey}, ${messageIdHeader}, ${args.accountId}, ${JSON.stringify(args.payload)}::jsonb, 'sent', ${args.gmailMessageId}, now())
        RETURNING id
      `)
    ).rows[0] as { id: string }
  ).id;
}

describe("compose visibility survives every send path", () => {
  it("INTERACTIVE send: a private compose creates a private thread", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-vis@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-vis@gunsnation.com");

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-vis-1", threadId: "th-vis-1" });
      fake.messages.set("g-vis-1", {
        id: "g-vis-1",
        threadId: "th-vis-1",
        labelIds: [],
        snippet: "p",
      });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "11111111-1111-1111-1111-111111111111",
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
          visibility: "private",
        },
      });
      expect(r.ok).toBe(true);
      expect(await threadVisibility(db, acctId, "th-vis-1")).toBe("private");
    });
  });

  it("SCHEDULED/worker send: a private compose creates a private thread when delivered later", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-vis2@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-vis2@gunsnation.com");

      const idempotencyKey = "22222222-2222-2222-2222-222222222222";
      const future = new Date(Date.now() + 3_600_000);
      const scheduled = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: new FakeGmailClient(),
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey,
          to: ["stranger@nowhere.com"],
          subject: "Hi later",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
          visibility: "private",
          scheduledSendAt: future,
        },
      });
      expect(scheduled.ok).toBe(true);
      if (scheduled.ok) expect(scheduled.value.status).toBe("scheduled");

      const workerFake = new FakeGmailClient();
      workerFake.sendImpl = () => ok({ id: "g-vis-2", threadId: "th-vis-2" });
      workerFake.messages.set("g-vis-2", {
        id: "g-vis-2",
        threadId: "th-vis-2",
        labelIds: [],
        snippet: "p",
      });

      await deliverScheduled(db, { accountId: acctId, idempotencyKey, workerFake });
      expect(await threadVisibility(db, acctId, "th-vis-2")).toBe("private");
    });
  });

  it("REPLAY-REPAIR: a private compose recorded in the stored payload repairs a private thread", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-vis3@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-vis3@gunsnation.com");

      const gmailMessageId = "g-vis-3";
      const attemptId = await seedSentAttempt(db, {
        accountId: acctId,
        gmailMessageId,
        payload: {
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          html: "<p>hi</p>",
          trackOpens: false,
          trackLinks: false,
          visibility: "private",
        },
      });

      const fake = new FakeGmailClient();
      fake.messages.set(gmailMessageId, {
        id: gmailMessageId,
        threadId: "th-vis-3",
        labelIds: [],
        snippet: "p",
      });

      const result = await ensureLocalCopyForReplay(db, {
        attemptId,
        accountId: acctId,
        fromEmail: "owner-vis3@gunsnation.com",
        gmail: fake,
        signal: AbortSignal.timeout(8000),
      });
      expect(result.ok).toBe(true);
      expect(await threadVisibility(db, acctId, "th-vis-3")).toBe("private");
    });
  });

  it("omitting visibility falls back to the column default (shared not forced), unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-vis4@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-vis4@gunsnation.com");

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-vis-4", threadId: "th-vis-4" });
      fake.messages.set("g-vis-4", {
        id: "g-vis-4",
        threadId: "th-vis-4",
        labelIds: [],
        snippet: "p",
      });

      const r = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: fake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey: "44444444-4444-4444-4444-444444444444",
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
        },
      });
      expect(r.ok).toBe(true);
      // DB default for email_threads.visibility is 'private'.
      expect(await threadVisibility(db, acctId, "th-vis-4")).toBe("private");
    });
  });
});
