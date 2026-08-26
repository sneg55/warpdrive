// An inbound email that lands on a deal-linked thread must notify the deal owner and its
// followers. Until this exists, the only trace of the arrival is the email_arrived realtime
// event, which is scoped to the mailbox owner's socket and leaves no row behind.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { applyMessageIds } from "./applyMessages";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const signal = new AbortController().signal;

const OWNER_EMAIL = "owner@example.com";
const CONTACT_EMAIL = "jane@acme.com";

function inboundMsg(args: {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
}): GmailMessage {
  return {
    id: args.id,
    threadId: args.threadId,
    labelIds: [],
    snippet: "hello",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: args.from },
        { name: "To", value: args.to },
        { name: "Subject", value: args.subject },
      ],
      body: { data: Buffer.from("hello").toString("base64url") },
    },
  };
}

interface Seeded {
  db: TestDb;
  ownerId: string;
  accountId: string;
  owner: AuthUser;
  personId: string;
  dealId: string;
}

// A mailbox owner who also owns an open deal whose primary person is CONTACT_EMAIL, so
// resolveLink auto-links an inbound message from that address to the deal.
async function seed(db: TestDb, dealVisibility: "owner" | "all" = "owner"): Promise<Seeded> {
  const user = await seedUser(db, { email: OWNER_EMAIL });
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address)
          VALUES (${user.id}, ${OWNER_EMAIL}) RETURNING id`,
    )
  ).rows[0] as { id: string };

  const person = (
    await db.execute(
      sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
          VALUES ('Jane', ${CONTACT_EMAIL}, ${user.id}, 'all') RETURNING id`,
    )
  ).rows[0] as { id: string };

  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seed: no stage returned");
  const deal = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, person_id, visibility_level)
      VALUES ('Valley Metro procurement', ${pipeline.id}, ${stage.id}, ${user.id}, ${person.id}, ${dealVisibility})
      RETURNING id
    `)
  ).rows[0] as { id: string };

  return {
    db,
    ownerId: user.id,
    accountId: acct.id,
    owner: { id: user.id, type: "regular", isActive: true, groupIds: new Set() },
    personId: person.id,
    dealId: deal.id,
  };
}

async function notificationsFor(
  db: TestDb,
  userId: string,
): Promise<
  {
    type: string;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
  }[]
> {
  const rows = await db.execute(
    sql`SELECT type, entity_type, entity_id, payload FROM notifications WHERE user_id=${userId}`,
  );
  return rows.rows as {
    type: string;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
  }[];
}

describe("inbound email on a deal-linked thread", () => {
  it("notifies the deal owner with a deal ref and the message subject", async () => {
    await withTestDb(async (db) => {
      const s = await seed(db);
      const fake = new FakeGmailClient();
      fake.messages.set(
        "m1",
        inboundMsg({
          id: "m1",
          threadId: "t1",
          from: CONTACT_EMAIL,
          to: OWNER_EMAIL,
          subject: "Re: Valley Metro procurement",
        }),
      );

      await applyMessageIds({ db, accountId: s.accountId, owner: s.owner, gmail: fake, signal }, [
        "m1",
      ]);

      const rows = await notificationsFor(db, s.ownerId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: "deal_email_received",
        entity_type: "deal",
        entity_id: s.dealId,
      });
      expect(rows[0]?.payload).toMatchObject({ subject: "Re: Valley Metro procurement" });
    });
  });

  it("notifies a follower who can see the deal", async () => {
    await withTestDb(async (db) => {
      const s = await seed(db, "all");
      const follower = await seedUser(db);
      await db.execute(
        sql`INSERT INTO deal_followers (deal_id, user_id) VALUES (${s.dealId}, ${follower.id})`,
      );

      const fake = new FakeGmailClient();
      fake.messages.set(
        "m1",
        inboundMsg({
          id: "m1",
          threadId: "t1",
          from: CONTACT_EMAIL,
          to: OWNER_EMAIL,
          subject: "Quote attached",
        }),
      );

      await applyMessageIds({ db, accountId: s.accountId, owner: s.owner, gmail: fake, signal }, [
        "m1",
      ]);

      expect(await notificationsFor(db, follower.id)).toHaveLength(1);
    });
  });

  it("suppresses a follower who cannot see the deal", async () => {
    await withTestDb(async (db) => {
      const s = await seed(db, "owner");
      const follower = await seedUser(db);
      await db.execute(
        sql`INSERT INTO deal_followers (deal_id, user_id) VALUES (${s.dealId}, ${follower.id})`,
      );

      const fake = new FakeGmailClient();
      fake.messages.set(
        "m1",
        inboundMsg({
          id: "m1",
          threadId: "t1",
          from: CONTACT_EMAIL,
          to: OWNER_EMAIL,
          subject: "Quote attached",
        }),
      );

      await applyMessageIds({ db, accountId: s.accountId, owner: s.owner, gmail: fake, signal }, [
        "m1",
      ]);

      expect(await notificationsFor(db, follower.id)).toHaveLength(0);
      expect(await notificationsFor(db, s.ownerId)).toHaveLength(1);
    });
  });

  it("does not duplicate when the same message id is re-applied", async () => {
    await withTestDb(async (db) => {
      const s = await seed(db);
      const fake = new FakeGmailClient();
      fake.messages.set(
        "m1",
        inboundMsg({
          id: "m1",
          threadId: "t1",
          from: CONTACT_EMAIL,
          to: OWNER_EMAIL,
          subject: "Re: Valley Metro procurement",
        }),
      );

      const args = { db, accountId: s.accountId, owner: s.owner, gmail: fake, signal };
      await applyMessageIds(args, ["m1"]);
      await applyMessageIds(args, ["m1"]);

      expect(await notificationsFor(db, s.ownerId)).toHaveLength(1);
    });
  });

  // Gmail history replays messages we SENT as messagesAdded, and applyMessageIds writes every
  // one of them with direction 'inbound'. Without a sender check, every reply you send from the
  // CRM or from Gmail notifies you about your own mail.
  it("does not notify for a message sent from the mailbox's own address", async () => {
    await withTestDb(async (db) => {
      const s = await seed(db);
      const fake = new FakeGmailClient();
      fake.messages.set(
        "m1",
        inboundMsg({
          id: "m1",
          threadId: "t1",
          from: CONTACT_EMAIL,
          to: OWNER_EMAIL,
          subject: "Re: Valley Metro procurement",
        }),
      );
      fake.messages.set(
        "m2",
        inboundMsg({
          id: "m2",
          threadId: "t1",
          from: OWNER_EMAIL,
          to: CONTACT_EMAIL,
          subject: "Re: Valley Metro procurement",
        }),
      );

      const args = { db, accountId: s.accountId, owner: s.owner, gmail: fake, signal };
      await applyMessageIds(args, ["m1"]);
      await applyMessageIds(args, ["m2"]);

      // Only the contact's message notifies; our own reply on the same thread does not.
      expect(await notificationsFor(db, s.ownerId)).toHaveLength(1);
    });
  });

  it("does not notify when the thread is linked to no deal", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { email: OWNER_EMAIL });
      const acct = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address)
              VALUES (${user.id}, ${OWNER_EMAIL}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      const owner: AuthUser = {
        id: user.id,
        type: "regular",
        isActive: true,
        groupIds: new Set(),
      };

      const fake = new FakeGmailClient();
      fake.messages.set(
        "m1",
        inboundMsg({
          id: "m1",
          threadId: "t1",
          from: "stranger@nowhere.test",
          to: OWNER_EMAIL,
          subject: "Cold outreach",
        }),
      );

      await applyMessageIds({ db, accountId: acct.id, owner, gmail: fake, signal }, ["m1"]);

      expect(await notificationsFor(db, user.id)).toHaveLength(0);
    });
  });
});
