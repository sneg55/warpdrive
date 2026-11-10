import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
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

describe("sendEmail deal linking (linkDealId)", () => {
  it("links a NEW outbound thread to the deal passed via linkDealId", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const { pipeline, stages } = await seedPipelineWithStages(db, ["New"]);
      const stageId = stages[0]?.id;
      if (stageId === undefined)
        throw new AppError(ERROR_IDS.DB_INVARIANT, "seedPipelineWithStages: no stage seeded");
      const deal = (
        await db.execute(sql`
          INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
          VALUES ('Sidebar-linked deal', ${pipeline.id}, ${stageId}, ${owner.id}, 'all')
          RETURNING id
        `)
      ).rows[0] as { id: string };

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-out-link1", threadId: "th-link1" });
      fake.messages.set("g-out-link1", {
        id: "g-out-link1",
        threadId: "th-link1",
        labelIds: [],
        snippet: "p",
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
          idempotencyKey: "77777777-7777-7777-7777-777777777777",
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
          linkDealId: deal.id,
        },
      });
      expect(r.ok).toBe(true);

      const thread = (
        await db.execute(sql`
          SELECT deal_id FROM email_threads
          WHERE account_id=${acctId} AND gmail_thread_id='th-link1'
        `)
      ).rows[0] as { deal_id: string | null } | undefined;
      expect(thread?.deal_id).toBe(deal.id);
    });
  });

  it("omitting linkDealId leaves recipient-based auto-linking unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "owner@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);

      const fake = new FakeGmailClient();
      fake.sendImpl = () => ok({ id: "g-out-link2", threadId: "th-link2" });
      fake.messages.set("g-out-link2", {
        id: "g-out-link2",
        threadId: "th-link2",
        labelIds: [],
        snippet: "p",
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
          idempotencyKey: "88888888-8888-8888-8888-888888888888",
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          bodyHtml: "<p>hi</p>",
          trackingEnabled: false,
        },
      });
      expect(r.ok).toBe(true);

      const thread = (
        await db.execute(sql`
          SELECT deal_id FROM email_threads
          WHERE account_id=${acctId} AND gmail_thread_id='th-link2'
        `)
      ).rows[0] as { deal_id: string | null } | undefined;
      expect(thread?.deal_id).toBeNull();
    });
  });
});
