import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { applyMessageIds } from "./applyMessages";
import { FakeGmailClient } from "./gmailFake";
import { listInbox } from "./inboxList";
import { ensureLocalCopyForReplay } from "./sendReplayRepair";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("repairs sync-first attribution from the recorded send actor without replacing an existing author", async () => {
  const signal = AbortSignal.timeout(8000);
  const author = await seedUser(ctx.db, { name: "Sam Sender" });
  const other = await seedUser(ctx.db, { name: "Other Member" });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [author.id, other.id], signal);
  const fromEmail = `${accountId}@example.com`;
  const gmail = new FakeGmailClient();
  gmail.messages.set("sent", {
    id: "sent",
    threadId,
    labelIds: ["SENT"],
    payload: {
      headers: [
        { name: "From", value: fromEmail },
        { name: "Date", value: "Mon, 09 Nov 2026 00:00:00 GMT" },
      ],
    },
  });
  expect(await applyMessageIds({ db: ctx.db, accountId, gmail, signal }, ["sent"])).toEqual({
    ok: true,
    value: 1,
  });
  const before = (
    await ctx.db.execute(
      sql`SELECT id, sent_by_user_id FROM email_messages WHERE account_id=${accountId}`,
    )
  ).rows[0];
  expect(before?.sent_by_user_id).toBeNull();
  const attemptId = randomUUID();
  const payload = {
    actorId: author.id,
    to: ["customer@example.com"],
    subject: "Reply",
    html: "<p>Hello</p>",
  };
  await ctx.db.execute(sql`INSERT INTO email_send_attempts
    (id, account_id, idempotency_key, message_id_header, payload, status, gmail_message_id)
    VALUES (${attemptId}, ${accountId}, ${randomUUID()}, ${`${attemptId}@example.com`}, ${JSON.stringify(payload)}::jsonb, 'sent', 'sent')`);
  const args = { attemptId, accountId, fromEmail, gmail, signal };
  gmail.calls.length = 0;
  expect(await ensureLocalCopyForReplay(ctx.db, args)).toEqual({
    ok: true,
    value: { messageId: "sent" },
  });
  expect(
    (
      await ctx.db.execute(
        sql`SELECT id, sent_by_user_id FROM email_messages WHERE account_id=${accountId}`,
      )
    ).rows,
  ).toEqual([{ id: before?.id, sent_by_user_id: author.id }]);
  expect(
    (
      await listInbox(
        ctx.db,
        { actor: teamActor(author.id), mailbox: accountId, filter: "all" },
        signal,
      )
    ).threads[0]?.replyStatus,
  ).toEqual({ kind: "replied", byName: "Sam" });
  await ensureLocalCopyForReplay(ctx.db, args);
  await ctx.db.execute(
    sql`UPDATE email_messages SET sent_by_user_id=${other.id} WHERE account_id=${accountId}`,
  );
  await ensureLocalCopyForReplay(ctx.db, args);
  expect(
    (
      await ctx.db.execute(
        sql`SELECT sent_by_user_id FROM email_messages WHERE account_id=${accountId}`,
      )
    ).rows,
  ).toEqual([{ sent_by_user_id: other.id }]);
  expect(gmail.calls).toEqual([]);
});
