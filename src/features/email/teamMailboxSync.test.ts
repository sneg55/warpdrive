import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { applyMessageIds } from "./applyMessages";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";
import { syncMailbox } from "./sync";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function teamMessage(id: string, threadId: string, from: string, at: string): GmailMessage {
  return {
    id,
    threadId,
    labelIds: ["INBOX"],
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: from },
        { name: "To", value: "customer@external.com" },
        { name: "Date", value: new Date(at).toUTCString() },
        { name: "Subject", value: "Request" },
      ],
    },
  };
}

it("classifies team sends, restores only newly delivered inbound and syncs without an owner", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db, { email: "sync-team@example.com" });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  await ctx.db.execute(
    sql`UPDATE email_threads SET archived_at=now(), last_inbound_at=NULL WHERE id=${threadId}`,
  );
  const gmail = new FakeGmailClient();
  gmail.messages.set(
    "sent",
    teamMessage("sent", threadId, `${accountId}@example.com`, "2026-01-02T00:00:00Z"),
  );
  gmail.messages.set(
    "received",
    teamMessage("received", threadId, "customer@external.com", "2026-01-03T00:00:00Z"),
  );
  const args = { db: ctx.db, accountId, owner: teamActor(member.id), gmail, signal };
  await applyMessageIds(args, ["sent"]);
  expect(
    (
      await ctx.db.execute(
        sql`SELECT direction, sent_by_user_id FROM email_messages WHERE account_id=${accountId}`,
      )
    ).rows[0],
  ).toEqual({ direction: "outbound", sent_by_user_id: null });
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).not.toBeNull();
  await applyMessageIds(args, ["received"]);
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).toBeNull();
  await ctx.db.execute(sql`UPDATE email_threads SET archived_at=now() WHERE id=${threadId}`);
  await applyMessageIds(args, ["received"]);
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).not.toBeNull();
  await ctx.db.execute(sql`UPDATE email_accounts SET last_history_id='1' WHERE id=${accountId}`);
  gmail.historyPages = [{ historyId: "2", history: [] }];
  expect(await syncMailbox(ctx.db, { accountId, gmail, signal })).toEqual({
    ok: true,
    value: { applied: 0 },
  });
});

it("unarchives post-anchor inbound inserted by import and preserves historical archive and replay", async () => {
  const signal = AbortSignal.timeout(8000);
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [], signal);
  const importedAt = new Date("2026-01-02T00:00:00Z");
  const gmail = new FakeGmailClient();
  const args = { db: ctx.db, accountId, gmail, signal };
  for (const [id, date] of [
    ["old", "2026-01-01T00:00:00Z"],
    ["new", "2026-01-03T00:00:00Z"],
  ] as const) {
    gmail.messages.set(id, teamMessage(id, threadId, "customer@external.com", date));
  }
  await ctx.db.execute(sql`UPDATE email_threads SET archived_at=now() WHERE id=${threadId}`);
  await applyMessageIds({ ...args, importedAt }, ["old"]);
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).not.toBeNull();
  await applyMessageIds({ ...args, importedAt }, ["new"]);
  await applyMessageIds(args, ["new"]);
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).toBeNull();
  await ctx.db.execute(sql`UPDATE email_threads SET archived_at=now() WHERE id=${threadId}`);
  await applyMessageIds({ ...args, importedAt }, ["new"]);
  await applyMessageIds(args, ["new"]);
  expect(
    (await ctx.db.execute(sql`SELECT archived_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.archived_at,
  ).not.toBeNull();
});
