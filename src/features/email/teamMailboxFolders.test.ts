import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { getThread, listInbox } from "./emailReads";
import { listArchivedThreads, listSentThreads } from "./folderReads";
import { searchInbox } from "./searchInbox";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { archiveThread } from "./threadArchive";
import { setFollowUpStatus } from "./threadAttributes";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("scopes team folders to membership while preserving the personal default", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db, { email: "folders@example.com" });
  const other = await seedUser(ctx.db, { email: "other-folders@example.com" });
  const actor = teamActor(member.id);
  const { accountId: mailbox, threadId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  const args = { actor, filter: "all" as const, mailbox };
  expect((await listInbox(ctx.db, args, signal)).threads.map((t) => t.id)).toEqual([threadId]);
  expect((await listInbox(ctx.db, { actor, filter: "all" }, signal)).threads).toEqual([]);
  expect(
    (await listInbox(ctx.db, { ...args, actor: teamActor(other.id) }, signal)).threads,
  ).toEqual([]);
  expect(
    (await searchInbox(ctx.db, { actor, q: "Team", mailbox }, signal)).map((t) => t.id),
  ).toEqual([threadId]);
  const view = await getThread(ctx.db, { actor, threadId, allowRemote: false }, signal);
  expect(view.ok && view.value.canCompose).toBe(true);
  expect((await setFollowUpStatus(ctx.db, { actor, threadId, status: "waiting" }, signal)).ok).toBe(
    true,
  );
  await ctx.db.execute(sql`INSERT INTO email_messages (account_id, thread_id, gmail_message_id, direction, from_email, sent_at)
    VALUES (${mailbox}, ${threadId}, 'reply', 'outbound', 'sales@example.com', now())`);
  expect(
    (await listSentThreads(ctx.db, actor, signal, { mailbox })).threads.map((t) => t.id),
  ).toEqual([threadId]);
  expect((await archiveThread(ctx.db, { actor, threadId }, signal)).ok).toBe(true);
  expect((await listInbox(ctx.db, args, signal)).threads).toEqual([]);
  expect(
    (await listArchivedThreads(ctx.db, actor, signal, { mailbox })).threads.map((t) => t.id),
  ).toEqual([threadId]);
});
