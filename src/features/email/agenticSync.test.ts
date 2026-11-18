import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENTIC_CHANGES_PAGE_LIMIT } from "@/constants/email";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { fakeAgenticProvider, seedAgenticMailbox } from "./agentic.test-helpers";
import { syncAgenticMailbox } from "./agenticSync";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";

const MAILBOX = "media@example.com";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let fake: FakeAgenticServer;
beforeEach(async () => {
  ctx = await makeTestDb();
  fake = await startFakeAgenticServer({ mailbox: MAILBOX });
});
afterEach(async () => {
  await fake.close();
  await ctx.close();
});

async function setup(signal: AbortSignal): Promise<string> {
  const member = await seedUser(ctx.db);
  return seedAgenticMailbox(
    ctx.db,
    { address: MAILBOX, baseUrl: fake.url, memberIds: [member.id] },
    signal,
  );
}

function sync(accountId: string, signal: AbortSignal) {
  const { client, provider } = fakeAgenticProvider(fake);
  return syncAgenticMailbox(ctx.db, { accountId, provider, client, signal });
}

async function account(accountId: string) {
  return (
    await ctx.db.execute(sql`SELECT provider_cursor, last_sync_at, last_error_id, backfill_started_at
      FROM email_accounts WHERE id=${accountId}`)
  ).rows[0] as {
    provider_cursor: string | number | null;
    last_sync_at: unknown;
    last_error_id: string | null;
    backfill_started_at: unknown;
  };
}

async function messages(accountId: string) {
  return (
    await ctx.db.execute(sql`SELECT m.gmail_message_id, m.direction, t.gmail_thread_id, t.deal_id
      FROM email_messages m JOIN email_threads t ON t.id = m.thread_id
      WHERE m.account_id=${accountId} ORDER BY m.gmail_message_id`)
  ).rows;
}

describe("syncAgenticMailbox", () => {
  it("first sync seeds the cursor from head and applies nothing", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    fake.seedEmail({ id: "old-1" });
    fake.seedEmail({ id: "old-2" });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: 0 }));
    const row = await account(accountId);
    expect(Number(row.provider_cursor)).toBe(2);
    expect(row.last_sync_at).not.toBeNull();
    expect(row.backfill_started_at).not.toBeNull();
    expect(await messages(accountId)).toEqual([]);
  });

  it("a later sync applies inbox and sent rows and advances the cursor", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    fake.seedEmail({ id: "old-1" });
    await sync(accountId, signal);
    await ctx.db.execute(
      sql`UPDATE email_accounts SET last_error_id='E_AINBOX_009' WHERE id=${accountId}`,
    );
    fake.seedEmail({ id: "in-1", sender: "jane@acme.com" });
    fake.seedEmail({ id: "out-1", folder: "sent", sender: MAILBOX, recipient: "jane@acme.com" });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: 2 }));
    const row = await account(accountId);
    expect(Number(row.provider_cursor)).toBe(3);
    expect(row.last_error_id).toBeNull();
    expect(await messages(accountId)).toEqual([
      {
        gmail_message_id: "in-1",
        direction: "inbound",
        gmail_thread_id: "thread-in-1",
        deal_id: null,
      },
      {
        gmail_message_id: "out-1",
        direction: "outbound",
        gmail_thread_id: "thread-out-1",
        deal_id: null,
      },
    ]);
  });

  it("pages the feed until a page is shorter than the limit", async () => {
    const signal = AbortSignal.timeout(20000);
    const accountId = await setup(signal);
    await sync(accountId, signal);
    for (let i = 0; i <= AGENTIC_CHANGES_PAGE_LIMIT; i += 1) fake.seedEmail({ id: `bulk-${i}` });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: AGENTIC_CHANGES_PAGE_LIMIT + 1 }));
    expect(Number((await account(accountId)).provider_cursor)).toBe(AGENTIC_CHANGES_PAGE_LIMIT + 1);
  });

  it("a reply row with the original's thread_id lands in the same email_thread and links to the deal", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    const owner = await seedUser(ctx.db);
    const { pipeline, stages } = await seedPipelineWithStages(ctx.db, ["Open"]);
    const person = (
      await ctx.db.execute(sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
        VALUES ('Jane', 'jane@acme.com', ${owner.id}, 'all') RETURNING id`)
    ).rows[0] as { id: string };
    const deal = (
      await ctx.db.execute(sql`INSERT INTO deals (title, pipeline_id, stage_id, owner_id, person_id, visibility_level)
        VALUES ('Jane deal', ${pipeline.id}, ${stages[0]?.id ?? null}, ${owner.id}, ${person.id}, 'all') RETURNING id`)
    ).rows[0] as { id: string };
    await sync(accountId, signal);
    fake.seedEmail({ id: "orig", thread_id: null, sender: "jane@acme.com" });
    fake.seedEmail({
      id: "reply",
      thread_id: "orig",
      sender: "jane@acme.com",
      in_reply_to: "orig@acme",
    });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: 2 }));
    expect(await messages(accountId)).toEqual([
      { gmail_message_id: "orig", direction: "inbound", gmail_thread_id: "orig", deal_id: deal.id },
      {
        gmail_message_id: "reply",
        direction: "inbound",
        gmail_thread_id: "orig",
        deal_id: deal.id,
      },
    ]);
  });

  it("a row already stored by a warpdrive send is not duplicated", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    await sync(accountId, signal);
    const thread = (
      await ctx.db.execute(sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, last_message_at)
        VALUES (${accountId}, 'thread-sent-1', 'Hello', now()) RETURNING id`)
    ).rows[0] as { id: string };
    await ctx.db.execute(sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email)
      VALUES (${thread.id}, ${accountId}, 'sent-1', 'outbound', ${MAILBOX})`);
    fake.seedEmail({ id: "sent-1", thread_id: "thread-sent-1", folder: "sent", sender: MAILBOX });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: 0 }));
    expect(await messages(accountId)).toEqual([
      {
        gmail_message_id: "sent-1",
        direction: "outbound",
        gmail_thread_id: "thread-sent-1",
        deal_id: null,
      },
    ]);
  });

  it("a change row with null sender and date is applied, not rejected", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    await sync(accountId, signal);
    fake.seedEmail({ id: "bare-in", sender: null, date: null, recipient: null, body: null });
    fake.seedEmail({ id: "bare-out", folder: "sent", sender: null, date: null });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: 2 }));
    const rows = (
      await ctx.db.execute(sql`SELECT gmail_message_id, direction, from_email, sent_at
        FROM email_messages WHERE account_id=${accountId} ORDER BY gmail_message_id`)
    ).rows;
    expect(rows).toEqual([
      { gmail_message_id: "bare-in", direction: "inbound", from_email: "", sent_at: null },
      { gmail_message_id: "bare-out", direction: "outbound", from_email: MAILBOX, sent_at: null },
    ]);
  });

  it("skips spam and trash rows without stalling the cursor", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    await sync(accountId, signal);
    fake.seedEmail({ id: "junk", folder: "spam" });
    fake.seedEmail({ id: "binned", folder: "trash" });

    expect(await sync(accountId, signal)).toEqual(ok({ applied: 0 }));
    expect(Number((await account(accountId)).provider_cursor)).toBe(2);
  });

  it("returns the client error and keeps the cursor when the feed fails", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await setup(signal);
    await sync(accountId, signal);
    fake.setAuthMode("redirect");

    const r = await sync(accountId, signal);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_AINBOX_001");
    expect(Number((await account(accountId)).provider_cursor)).toBe(0);
  });
});
