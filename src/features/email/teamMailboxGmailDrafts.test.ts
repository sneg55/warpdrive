import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { listSentThreads } from "./folderReads";
import { FakeGmailClient } from "./gmailFake";
import { listInbox } from "./inboxList";
import { syncMailbox } from "./sync";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { runTeamBackfillPage } from "./teamMailboxBackfill";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it.each(["import", "sync"])("ignores unsent Gmail drafts during %s", async (path) => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db);
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  await ctx.db.execute(
    sql`UPDATE email_accounts SET last_history_id='1', backfill_days=90 WHERE id=${accountId}`,
  );
  const gmail = new FakeGmailClient();
  const messages = [
    { id: "inbound", threadId, labelIds: ["INBOX"] },
    { id: "draft-reply", threadId, labelIds: ["DRAFT"] },
    { id: "draft-new", threadId: "draft-only-thread", labelIds: ["INBOX", "DRAFT"] },
  ];
  for (const message of messages) {
    gmail.messages.set(message.id, {
      ...message,
      payload: {
        headers: [
          {
            name: "From",
            value: message.id === "inbound" ? "customer@example.com" : `${accountId}@example.com`,
          },
          {
            name: "Date",
            value:
              message.id === "inbound"
                ? "Thu, 01 Jan 2026 00:00:00 GMT"
                : "Fri, 02 Jan 2026 00:00:00 GMT",
          },
        ],
      },
    });
  }
  gmail.threads.set(threadId, { id: threadId, messages: messages.slice(0, 2) });
  gmail.threads.set("draft-only-thread", { id: "draft-only-thread", messages: messages.slice(2) });
  if (path === "import") {
    const result = await runTeamBackfillPage(ctx.db, {
      accountId,
      gmail,
      signal,
      listThreads: ({ signal }) => {
        signal.throwIfAborted();
        return Promise.resolve(ok({ threads: [{ id: threadId }, { id: "draft-only-thread" }] }));
      },
    });
    expect(result.ok).toBe(true);
  } else {
    gmail.historyPages = [
      { historyId: "2", history: [{ messagesAdded: messages.map((message) => ({ message })) }] },
    ];
    expect((await syncMailbox(ctx.db, { accountId, gmail, signal })).ok).toBe(true);
  }
  expect(
    (
      await ctx.db.execute(
        sql`SELECT gmail_message_id FROM email_messages WHERE account_id=${accountId}`,
      )
    ).rows,
  ).toEqual([{ gmail_message_id: "inbound" }]);
  expect(
    (await ctx.db.execute(sql`SELECT id FROM email_threads WHERE account_id=${accountId}`)).rows,
  ).toHaveLength(1);
  const actor = teamActor(user.id);
  expect(
    (await listInbox(ctx.db, { actor, mailbox: accountId, filter: "all" }, signal)).threads[0]
      ?.replyStatus?.kind,
  ).toBe("unanswered");
  expect((await listSentThreads(ctx.db, actor, signal, { mailbox: accountId })).threads).toEqual(
    [],
  );
});
