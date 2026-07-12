import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";
import { runSendJob } from "./worker";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// P1 regression coverage: a SCHEDULED send is delivered later by the worker
// (performWorkerSendCrm), which is a separate code path from the interactive send in
// send.ts. send.linkDeal.test.ts covers the interactive path only; this file mirrors it
// for the scheduled/worker path so an explicit composer-picked deal is not dropped when
// the send is deferred.
async function seedAccount(db: TestDb, ownerId: string, email: string): Promise<string> {
  return (
    (
      await db.execute(
        sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
      )
    ).rows[0] as { id: string }
  ).id;
}

// A person (visible to all) plus their sole open deal, so recipient-based resolution
// links both. Mirrors sendStore.test.ts's helper of the same name.
async function seedPersonWithOpenDeal(
  db: TestDb,
  ownerId: string,
  email: string,
): Promise<{ personId: string; dealId: string }> {
  const person = (
    await db.execute(sql`
      INSERT INTO persons (name, primary_email, owner_id, visibility_level)
      VALUES ('Contact', ${email}, ${ownerId}, 'all') RETURNING id
    `)
  ).rows[0] as { id: string };
  const { pipeline, stages } = await seedPipelineWithStages(db, ["New"]);
  const stageId = stages[0]?.id;
  if (stageId === undefined) throw new Error("seedPipelineWithStages: no stage seeded");
  const deal = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, person_id, status)
      VALUES ('Deal', ${pipeline.id}, ${stageId}, ${ownerId}, 'all', ${person.id}, 'open')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return { personId: person.id, dealId: deal.id };
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

// Enqueue a scheduled send, back-date it so it is due, then drive delivery through the
// worker send handler (the same handler the delayed pg-boss job fires).
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

describe("scheduled send deal linking (linkDealId via the worker path)", () => {
  it("links a NEW outbound thread to the deal passed via linkDealId when delivered via the SCHEDULED/worker path", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-sched@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-sched@gunsnation.com");
      const { pipeline, stages } = await seedPipelineWithStages(db, ["New"]);
      const stageId = stages[0]?.id;
      if (stageId === undefined) throw new Error("seedPipelineWithStages: no stage seeded");
      const deal = (
        await db.execute(sql`
          INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
          VALUES ('Sidebar-linked scheduled deal', ${pipeline.id}, ${stageId}, ${owner.id}, 'all')
          RETURNING id
        `)
      ).rows[0] as { id: string };

      const idempotencyKey = "99999999-9999-9999-9999-999999999991";
      const future = new Date(Date.now() + 3_600_000);
      const setupFake = new FakeGmailClient();
      const scheduled = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: setupFake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey,
          // Recipient does not match any contact/deal, so a link can only come from linkDealId.
          to: ["stranger@nowhere.com"],
          subject: "Hi later",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
          linkDealId: deal.id,
          scheduledSendAt: future,
        },
      });
      expect(scheduled.ok).toBe(true);
      if (scheduled.ok) expect(scheduled.value.status).toBe("scheduled");

      const workerFake = new FakeGmailClient();
      workerFake.sendImpl = () => ok({ id: "g-out-sched-link1", threadId: "th-sched-link1" });
      workerFake.messages.set("g-out-sched-link1", {
        id: "g-out-sched-link1",
        threadId: "th-sched-link1",
        labelIds: [],
        snippet: "p",
      });

      await deliverScheduled(db, { accountId: acctId, idempotencyKey, workerFake });

      const dealId = await threadDealId(db, acctId, "th-sched-link1");
      expect(dealId).toBe(deal.id);
    });
  });

  it("omitting linkDealId on a scheduled send still auto-links by recipient, as before", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner-sched2@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "owner-sched2@gunsnation.com");
      const { dealId: autoDealId } = await seedPersonWithOpenDeal(
        db,
        owner.id,
        "buyer-sched@corp.com",
      );

      const idempotencyKey = "99999999-9999-9999-9999-999999999992";
      const future = new Date(Date.now() + 3_600_000);
      const setupFake = new FakeGmailClient();
      const scheduled = await sendEmail(db, {
        actorId: owner.id,
        actorType: "regular",
        actorGroupIds: new Set<string>(),
        gmail: setupFake,
        storage: new FakeStorageClient(),
        input: {
          accountId: acctId,
          idempotencyKey,
          to: ["buyer-sched@corp.com"],
          subject: "Hi later, no explicit link",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
          scheduledSendAt: future,
        },
      });
      expect(scheduled.ok).toBe(true);
      if (scheduled.ok) expect(scheduled.value.status).toBe("scheduled");

      const workerFake = new FakeGmailClient();
      workerFake.sendImpl = () => ok({ id: "g-out-sched-link2", threadId: "th-sched-link2" });
      workerFake.messages.set("g-out-sched-link2", {
        id: "g-out-sched-link2",
        threadId: "th-sched-link2",
        labelIds: [],
        snippet: "p",
      });

      await deliverScheduled(db, { accountId: acctId, idempotencyKey, workerFake });

      const dealId = await threadDealId(db, acctId, "th-sched-link2");
      expect(dealId).toBe(autoDealId);
    });
  });
});
