import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { FakeGmailClient } from "./gmailFake";
import type { SendPayload } from "./outboxClaim";
import { ensureLocalCopyForReplay } from "./sendReplayRepair";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedAccount(db: TestDb, ownerId: string, email: string): Promise<string> {
  return (
    (
      await db.execute(
        sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
      )
    ).rows[0] as { id: string }
  ).id;
}

// Insert an email_send_attempts row directly, standing in for an attempt Gmail already
// accepted (status='sent', gmail_message_id set) but whose local copy was never stored
// (crash between markSent and storeOutboundCopy). ensureLocalCopyForReplay is what a
// replay of this attempt runs to repair it.
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

async function threadDealId(
  db: TestDb,
  accountId: string,
  gmailThreadId: string,
): Promise<string | null> {
  const row = (
    await db.execute(sql`
      SELECT deal_id FROM email_threads
      WHERE account_id=${accountId} AND gmail_thread_id=${gmailThreadId}
    `)
  ).rows[0] as { deal_id: string | null } | undefined;
  return row?.deal_id ?? null;
}

// P2 fix: the stored send payload carries the composer's explicit linkDealId/linkPersonId
// (see send.ts's enqueueSend call and workerSendCrm.ts's performWorkerSendCrm), but the
// replay-repair path used to call storeOutboundCopy without a `link`, so a repaired thread
// lost the composer's explicit deal/person link even though it was sitting in the payload.
describe("ensureLocalCopyForReplay", () => {
  it("links the repaired thread to the deal recorded in the stored payload's linkDealId", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-replay@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-replay@gunsnation.com");
      const { pipeline, stages } = await seedPipelineWithStages(db, ["New"]);
      const stageId = stages[0]?.id;
      if (stageId === undefined) throw new Error("seedPipelineWithStages: no stage seeded");
      const deal = (
        await db.execute(sql`
          INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
          VALUES ('Replay-linked deal', ${pipeline.id}, ${stageId}, ${owner.id}, 'all')
          RETURNING id
        `)
      ).rows[0] as { id: string };

      const gmailMessageId = "g-replay-linked-1";
      const attemptId = await seedSentAttempt(db, {
        accountId: acctId,
        gmailMessageId,
        payload: {
          // Recipient does not match any contact/deal, so a link can only come from linkDealId.
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          html: "<p>hi</p>",
          trackOpens: false,
          trackLinks: false,
          linkDealId: deal.id,
        },
      });

      const fake = new FakeGmailClient();
      fake.messages.set(gmailMessageId, {
        id: gmailMessageId,
        threadId: "th-replay-linked-1",
        labelIds: [],
        snippet: "p",
      });

      const result = await ensureLocalCopyForReplay(db, {
        attemptId,
        accountId: acctId,
        fromEmail: "owner-replay@gunsnation.com",
        gmail: fake,
        signal: AbortSignal.timeout(8000),
      });
      expect(result.ok).toBe(true);

      const dealId = await threadDealId(db, acctId, "th-replay-linked-1");
      expect(dealId).toBe(deal.id);
    });
  });

  it("omitting linkDealId in the stored payload still repairs unlinked (recipient-based), as before", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-replay2@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-replay2@gunsnation.com");

      const gmailMessageId = "g-replay-unlinked-1";
      const attemptId = await seedSentAttempt(db, {
        accountId: acctId,
        gmailMessageId,
        payload: {
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          html: "<p>hi</p>",
          trackOpens: false,
          trackLinks: false,
        },
      });

      const fake = new FakeGmailClient();
      fake.messages.set(gmailMessageId, {
        id: gmailMessageId,
        threadId: "th-replay-unlinked-1",
        labelIds: [],
        snippet: "p",
      });

      const result = await ensureLocalCopyForReplay(db, {
        attemptId,
        accountId: acctId,
        fromEmail: "owner-replay2@gunsnation.com",
        gmail: fake,
        signal: AbortSignal.timeout(8000),
      });
      expect(result.ok).toBe(true);

      const dealId = await threadDealId(db, acctId, "th-replay-unlinked-1");
      expect(dealId).toBeNull();
    });
  });
});
