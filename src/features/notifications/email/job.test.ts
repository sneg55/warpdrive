import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { SystemMessage } from "@/features/email/sendSystem";
import { setPreference } from "@/features/notifications/preferences";
import type { EmailAccountRow } from "@/types/email";
import { ok } from "@/types/result";
import { runEmailNotificationJob } from "./job";

// Insert a connected email_accounts row for the given user. Returns the row.
async function connectMailbox(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  address = `mailbox-${Date.now()}@example.com`,
): Promise<EmailAccountRow> {
  const row = (
    await db.execute(sql`
      INSERT INTO email_accounts (user_id, email_address, status)
      VALUES (${userId}, ${address}, 'connected')
      RETURNING id, user_id, email_address
    `)
  ).rows[0] as { id: string; user_id: string; email_address: string } | undefined;
  if (row === undefined) throw new Error("connectMailbox: insert returned no rows");
  return { id: row.id, userId: row.user_id, emailAddress: row.email_address };
}

// Insert a deal and return its id. Uses raw SQL (no seedDeal factory exists).
async function seedDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  opts: { ownerId: string; visibilityLevel: "owner" | "all" },
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedDeal: no stage");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${opts.ownerId}, ${opts.visibilityLevel})
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedDeal: insert returned no rows");
  return row.id;
}

describe("runEmailNotificationJob", () => {
  it("drops (no send) when the referenced deal is no longer visible to the recipient", async () => {
    // RED: this is the security assertion. runEmailNotificationJob must NOT call send
    // when the recipient cannot see the deal that the notification references.
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const other = await seedUser(db);
      // Deal owned by 'other' with owner-level visibility: alice cannot see it.
      const dealId = await seedDeal(db, { ownerId: other.id, visibilityLevel: "owner" });
      const [n] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "deal_followed_update",
          entityType: "deal",
          entityId: dealId,
          actorId: other.id,
          payload: {},
        })
        .returning();
      if (n === undefined) throw new Error("notification insert failed");

      const calls: { acct: EmailAccountRow; msg: SystemMessage }[] = [];
      // Fake: synchronous return wrapped in Promise.resolve; signal not needed.
      const fakeSend = (acct: EmailAccountRow, msg: SystemMessage) => {
        calls.push({ acct, msg });
        return Promise.resolve(ok({ gmailMessageId: "x" }));
      };

      const r = await runEmailNotificationJob(
        db,
        { notificationId: n.id },
        new AbortController().signal,
        {
          send: fakeSend,
        },
      );
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.sent).toBe(false);
      // Security assertion: send must NOT have been called.
      expect(calls).toHaveLength(0);
    });
  }, 60_000);

  it("suppresses (no send) when recipient has no connected mailbox", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      // Deal alice owns and can see, but she has no email_accounts row.
      const dealId = await seedDeal(db, { ownerId: alice.id, visibilityLevel: "all" });
      const [n] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        })
        .returning();
      if (n === undefined) throw new Error("notification insert failed");

      const calls: { acct: EmailAccountRow; msg: SystemMessage }[] = [];
      const fakeSend = (acct: EmailAccountRow, msg: SystemMessage) => {
        calls.push({ acct, msg });
        return Promise.resolve(ok({ gmailMessageId: "x" }));
      };

      const r = await runEmailNotificationJob(
        db,
        { notificationId: n.id },
        new AbortController().signal,
        {
          send: fakeSend,
        },
      );
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.sent).toBe(false);
      expect(calls).toHaveLength(0);
    });
  }, 60_000);

  // Codex finding F35: email delivery preference was checked only at enqueue. If the user
  // disables email for this type after the job is queued but before it runs, the worker must
  // re-resolve the preference at send time and drop the send.
  it("drops (no send) when the recipient has disabled email delivery for this type", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await connectMailbox(db, alice.id);
      const dealId = await seedDeal(db, { ownerId: alice.id, visibilityLevel: "all" });
      const signal = new AbortController().signal;
      // Explicitly disable email for this type (simulating an opt-out after enqueue).
      await setPreference(db, alice.id, "deal_won", { inApp: true, email: false }, signal);
      const [n] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        })
        .returning();
      if (n === undefined) throw new Error("notification insert failed");

      const calls: { acct: EmailAccountRow; msg: SystemMessage }[] = [];
      const fakeSend = (acct: EmailAccountRow, msg: SystemMessage) => {
        calls.push({ acct, msg });
        return Promise.resolve(ok({ gmailMessageId: "x" }));
      };

      const r = await runEmailNotificationJob(db, { notificationId: n.id }, signal, {
        send: fakeSend,
      });
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.sent).toBe(false);
      expect(calls).toHaveLength(0);
    });
  }, 60_000);

  it("sends when the recipient can see the entity and has a connected mailbox", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const mailbox = await connectMailbox(db, alice.id);
      const dealId = await seedDeal(db, { ownerId: alice.id, visibilityLevel: "all" });
      const signal = new AbortController().signal;
      // Email delivery must be enabled at send time (default is off).
      await setPreference(db, alice.id, "deal_won", { inApp: true, email: true }, signal);
      const [n] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        })
        .returning();
      if (n === undefined) throw new Error("notification insert failed");

      const calls: { acct: EmailAccountRow; msg: SystemMessage }[] = [];
      const fakeSend = (acct: EmailAccountRow, msg: SystemMessage) => {
        calls.push({ acct, msg });
        return Promise.resolve(ok({ gmailMessageId: "g1" }));
      };

      const r = await runEmailNotificationJob(db, { notificationId: n.id }, signal, {
        send: fakeSend,
      });
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.sent).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.msg.to).toContain(mailbox.emailAddress);
      expect(calls[0]?.msg.subject.length).toBeGreaterThan(0);
    });
  }, 60_000);

  // Codex finding F36: pg-boss is at-least-once. A crash or timeout after Gmail accepted the
  // message but before the job was acknowledged retries the job. Without a persisted marker
  // the retry sends a duplicate email. The job must skip a row it has already emailed.
  it("does not re-send when the notification was already emailed (idempotent retry)", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await connectMailbox(db, alice.id);
      const dealId = await seedDeal(db, { ownerId: alice.id, visibilityLevel: "all" });
      const signal = new AbortController().signal;
      await setPreference(db, alice.id, "deal_won", { inApp: true, email: true }, signal);
      const [n] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
          // Already emailed on a prior (acknowledged-late) attempt.
          emailSentAt: new Date(),
        })
        .returning();
      if (n === undefined) throw new Error("notification insert failed");

      const calls: { acct: EmailAccountRow; msg: SystemMessage }[] = [];
      const fakeSend = (acct: EmailAccountRow, msg: SystemMessage) => {
        calls.push({ acct, msg });
        return Promise.resolve(ok({ gmailMessageId: "dup" }));
      };

      const r = await runEmailNotificationJob(db, { notificationId: n.id }, signal, {
        send: fakeSend,
      });
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.sent).toBe(false);
      expect(calls).toHaveLength(0);
    });
  }, 60_000);

  it("records the delivery marker after a successful send", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await connectMailbox(db, alice.id);
      const dealId = await seedDeal(db, { ownerId: alice.id, visibilityLevel: "all" });
      const signal = new AbortController().signal;
      await setPreference(db, alice.id, "deal_won", { inApp: true, email: true }, signal);
      const [n] = await db
        .insert(notifications)
        .values({
          userId: alice.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        })
        .returning();
      if (n === undefined) throw new Error("notification insert failed");

      const fakeSend = () => Promise.resolve(ok({ gmailMessageId: "g1" }));
      const r = await runEmailNotificationJob(db, { notificationId: n.id }, signal, {
        send: fakeSend,
      });
      expect(r.ok).toBe(true);
      if (r.ok === true) expect(r.value.sent).toBe(true);

      const [after] = await db
        .select({ emailSentAt: notifications.emailSentAt })
        .from(notifications)
        .where(eq(notifications.id, n.id));
      expect(after?.emailSentAt).not.toBeNull();
    });
  }, 60_000);
});
