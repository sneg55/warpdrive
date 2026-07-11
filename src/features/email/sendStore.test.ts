import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { FakeGmailClient } from "./gmailFake";
import type { SendEmailInput } from "./send";
import { storeOutboundCopy } from "./sendStore";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

const SIG = (): AbortSignal => new AbortController().signal;
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedAccount(db: TestDb, userId: string): Promise<string> {
  const r = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, 'me@acme.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  return r.id;
}

// A person (visible to all) plus their sole open deal, so recipient-based resolution links both.
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
  const pipeline = (await db.execute(sql`INSERT INTO pipelines (name) VALUES ('P') RETURNING id`))
    .rows[0] as { id: string };
  const stage = (
    await db.execute(
      sql`INSERT INTO stages (name, pipeline_id, "order") VALUES ('S1', ${pipeline.id}, 0) RETURNING id`,
    )
  ).rows[0] as { id: string };
  const deal = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, person_id, status)
      VALUES ('Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all', ${person.id}, 'open')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return { personId: person.id, dealId: deal.id };
}

function inputTo(recipient: string): SendEmailInput {
  return {
    accountId: randomUUID(),
    idempotencyKey: randomUUID(),
    to: [recipient],
    subject: "Hello",
    bodyHtml: "<p>hi</p>",
  };
}

async function threadLink(
  db: TestDb,
  accountId: string,
): Promise<{ person_id: string | null; deal_id: string | null }> {
  return (
    await db.execute(
      sql`SELECT person_id, deal_id FROM email_threads WHERE account_id=${accountId}`,
    )
  ).rows[0] as { person_id: string | null; deal_id: string | null };
}

describe("storeOutboundCopy thread linking", () => {
  it("auto-links a new thread to the recipient's person and sole open deal", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const acctId = await seedAccount(db, owner.id);
      const { personId, dealId } = await seedPersonWithOpenDeal(db, owner.id, "buyer@corp.com");

      const r = await storeOutboundCopy(db, {
        accountId: acctId,
        fromEmail: "me@acme.com",
        gmailMessageId: "g1",
        input: inputTo("buyer@corp.com"),
        resolvedTrackingEnabled: false,
        bodyHtml: "<p>hi</p>",
        gmail: new FakeGmailClient(),
        link: {
          owner: actorOf(owner.id),
          recipients: ["buyer@corp.com"],
          explicitPersonId: null,
          explicitDealId: null,
        },
        signal: SIG(),
      });
      expect(r.ok).toBe(true);

      const link = await threadLink(db, acctId);
      expect(link.person_id).toBe(personId);
      expect(link.deal_id).toBe(dealId);
    });
  });

  it("links to the explicit person/deal from the composer even without a recipient match", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const acctId = await seedAccount(db, owner.id);
      // Contact's email differs from the recipient, so ONLY the explicit ids can link it.
      const { personId, dealId } = await seedPersonWithOpenDeal(db, owner.id, "someone@else.com");

      const r = await storeOutboundCopy(db, {
        accountId: acctId,
        fromEmail: "me@acme.com",
        gmailMessageId: "g1",
        input: inputTo("buyer@corp.com"),
        resolvedTrackingEnabled: false,
        bodyHtml: "<p>hi</p>",
        gmail: new FakeGmailClient(),
        link: {
          owner: actorOf(owner.id),
          recipients: ["buyer@corp.com"],
          explicitPersonId: personId,
          explicitDealId: dealId,
        },
        signal: SIG(),
      });
      expect(r.ok).toBe(true);

      const link = await threadLink(db, acctId);
      expect(link.person_id).toBe(personId);
      expect(link.deal_id).toBe(dealId);
    });
  });

  it("fills the person from the recipient when the composer pins only the deal", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const acctId = await seedAccount(db, owner.id);
      // The recipient IS this person; the deal is passed explicitly (as the deal workspace does).
      const { personId, dealId } = await seedPersonWithOpenDeal(db, owner.id, "buyer@corp.com");

      const r = await storeOutboundCopy(db, {
        accountId: acctId,
        fromEmail: "me@acme.com",
        gmailMessageId: "g1",
        input: inputTo("buyer@corp.com"),
        resolvedTrackingEnabled: false,
        bodyHtml: "<p>hi</p>",
        gmail: new FakeGmailClient(),
        link: {
          owner: actorOf(owner.id),
          recipients: ["buyer@corp.com"],
          explicitPersonId: null,
          explicitDealId: dealId,
        },
        signal: SIG(),
      });
      expect(r.ok).toBe(true);

      const link = await threadLink(db, acctId);
      expect(link.deal_id).toBe(dealId);
      expect(link.person_id).toBe(personId); // filled from the recipient
    });
  });

  it("leaves the thread unlinked when no link context is supplied (back-compat)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const acctId = await seedAccount(db, owner.id);
      await seedPersonWithOpenDeal(db, owner.id, "buyer@corp.com");

      const r = await storeOutboundCopy(db, {
        accountId: acctId,
        fromEmail: "me@acme.com",
        gmailMessageId: "g1",
        input: inputTo("buyer@corp.com"),
        resolvedTrackingEnabled: false,
        bodyHtml: "<p>hi</p>",
        gmail: new FakeGmailClient(),
        signal: SIG(),
      });
      expect(r.ok).toBe(true);

      const link = await threadLink(db, acctId);
      expect(link.person_id).toBeNull();
      expect(link.deal_id).toBeNull();
    });
  });

  it("preserves an existing thread's link on a reply (does not re-resolve or clobber)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const acctId = await seedAccount(db, owner.id);
      const { personId } = await seedPersonWithOpenDeal(db, owner.id, "buyer@corp.com");
      // A thread already exists for gmail thread t1 (FakeGmailClient default), manually linked
      // to the person but NOT the deal. A reply must keep exactly that link.
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, last_message_at)
        VALUES ('t1', ${acctId}, 'Existing', ${personId}, now())
      `);

      const r = await storeOutboundCopy(db, {
        accountId: acctId,
        fromEmail: "me@acme.com",
        gmailMessageId: "g1",
        input: inputTo("buyer@corp.com"),
        resolvedTrackingEnabled: false,
        bodyHtml: "<p>hi</p>",
        gmail: new FakeGmailClient(),
        link: {
          owner: actorOf(owner.id),
          recipients: ["buyer@corp.com"],
          explicitPersonId: null,
          explicitDealId: null,
        },
        signal: SIG(),
      });
      expect(r.ok).toBe(true);

      const link = await threadLink(db, acctId);
      expect(link.person_id).toBe(personId);
      expect(link.deal_id).toBeNull(); // unchanged: the reply did not auto-add the deal
    });
  });
});
