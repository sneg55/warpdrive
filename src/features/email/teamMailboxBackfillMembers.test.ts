import { sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { TEAM_MAILBOX_BACKFILL_QUEUE } from "@/constants/teamMailbox";
import { seedUser } from "@/db/testing/factories";
import * as bossProvider from "@/jobs/requireBoss";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { enqueuePendingBackfill } from "./teamBackfillJobs";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";
import { runTeamBackfillPage } from "./teamMailboxBackfill";
import { setTeamMailboxMembers } from "./teamMailboxMembers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await ctx.close();
});

it("does not enqueue a bootstrapped mailbox with no members", async () => {
  const signal = AbortSignal.timeout(8000);
  const { accountId } = await seedTeamMailbox(ctx.db, [], signal);
  await ctx.db.execute(
    sql`UPDATE email_accounts SET backfill_days=90, last_history_id='100' WHERE id=${accountId}`,
  );
  const enqueue = vi.fn(() => Promise.resolve());
  await enqueuePendingBackfill(ctx.db, accountId, enqueue, signal);
  expect(enqueue).not.toHaveBeenCalled();
});

it("defers a queued import until members exist, then resolves historical CRM links", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { isAdmin: true });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [], signal);
  await ctx.db.execute(sql`DELETE FROM email_threads WHERE id=${threadId}`);
  await ctx.db.execute(
    sql`UPDATE email_accounts SET backfill_days=90, last_history_id='100' WHERE id=${accountId}`,
  );
  const person = (
    await ctx.db.execute(sql`
    INSERT INTO persons (name, primary_email, owner_id, visibility_level)
    VALUES ('Customer', 'customer@external.com', ${user.id}, 'owner') RETURNING id
  `)
  ).rows[0] as { id: string };
  const gmail = new FakeGmailClient();
  gmail.messages.set("history", {
    id: "history",
    threadId: "history",
    labelIds: ["INBOX"],
    payload: { headers: [{ name: "From", value: "customer@external.com" }] },
  });
  gmail.threads.set("history", {
    id: "history",
    messages: [{ id: "history", labelIds: ["INBOX"] }],
  });
  const listThreads = vi.fn(() => Promise.resolve(ok({ threads: [{ id: "history" }] })));
  const args = { accountId, gmail, listThreads, signal };
  expect((await runTeamBackfillPage(ctx.db, args)).ok).toBe(true);
  expect(listThreads).not.toHaveBeenCalled();
  expect(
    (await ctx.db.execute(sql`SELECT backfill_status FROM email_accounts WHERE id=${accountId}`))
      .rows[0]?.backfill_status,
  ).toBeNull();
  expect(
    (
      await setTeamMailboxMembers(
        ctx.db,
        { actorId: user.id, accountId, userIds: [user.id] },
        signal,
      )
    ).ok,
  ).toBe(true);
  expect((await runTeamBackfillPage(ctx.db, args)).ok).toBe(true);
  expect(
    (await ctx.db.execute(sql`SELECT person_id FROM email_threads WHERE account_id=${accountId}`))
      .rows,
  ).toEqual([{ person_id: person.id }]);
});

it("enqueues pending history import when the first members are saved", async () => {
  const signal = AbortSignal.timeout(8000);
  const admin = await seedUser(ctx.db, { isAdmin: true });
  const { accountId } = await seedTeamMailbox(ctx.db, [], signal);
  await ctx.db.execute(
    sql`UPDATE email_accounts SET backfill_days=90, last_history_id='100' WHERE id=${accountId}`,
  );
  const boss = new PgBoss(ctx.url);
  await boss.start();
  try {
    await boss.createQueue(TEAM_MAILBOX_BACKFILL_QUEUE, { policy: "singleton" });
    vi.spyOn(bossProvider, "requireBoss").mockReturnValue(boss);
    expect(
      (
        await setTeamMailboxMembers(
          ctx.db,
          { actorId: admin.id, accountId, userIds: [admin.id] },
          signal,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await ctx.db.execute(
          sql`SELECT data FROM pgboss.job WHERE name=${TEAM_MAILBOX_BACKFILL_QUEUE}`,
        )
      ).rows,
    ).toEqual([{ data: { accountId } }]);
  } finally {
    await boss.stop();
  }
});
