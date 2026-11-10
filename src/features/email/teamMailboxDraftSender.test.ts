import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { deleteDraft, listDrafts, saveDraft } from "./draftRepo";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("moves an author's draft between authorized senders without sharing it", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "sender-switch@example.com" });
  const other = await seedUser(ctx.db, { email: "sender-other@example.com" });
  const first = await seedTeamMailbox(ctx.db, [user.id, other.id], signal);
  const second = await seedTeamMailbox(ctx.db, [user.id, other.id], signal);
  const actor = teamActor(user.id);
  const draft = {
    accountId: first.accountId,
    threadId: first.threadId,
    subject: "Keep me",
    bodyHtml: "Body",
    toEmails: ["customer@example.com"],
    ccEmails: [],
  };
  const saved = await saveDraft(ctx.db, { actor, draft }, signal);
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;
  const moved = { ...draft, id: saved.value.id, accountId: second.accountId, threadId: null };
  expect((await saveDraft(ctx.db, { actor: teamActor(other.id), draft: moved }, signal)).ok).toBe(
    false,
  );
  expect((await saveDraft(ctx.db, { actor, draft: moved }, signal)).ok).toBe(true);
  expect(await listDrafts(ctx.db, actor, signal)).toEqual([
    expect.objectContaining({
      id: saved.value.id,
      accountId: second.accountId,
      subject: "Keep me",
      threadId: null,
    }),
  ]);
  expect(await listDrafts(ctx.db, teamActor(other.id), signal)).toEqual([]);
});

it("preserves legacy personal draft authorship when moving to a team mailbox", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "legacy-sender@example.com" });
  const other = await seedUser(ctx.db, { email: "legacy-other@example.com" });
  const team = await seedTeamMailbox(ctx.db, [user.id, other.id], signal);
  const personal = (
    await ctx.db.execute(sql`
    INSERT INTO email_accounts (user_id, email_address)
    VALUES (${user.id}, 'legacy-personal@example.com') RETURNING id
  `)
  ).rows[0] as { id: string };
  const legacy = (
    await ctx.db.execute(sql`
    INSERT INTO email_drafts (account_id, subject, body_html)
    VALUES (${personal.id}, 'Legacy', 'Body') RETURNING id
  `)
  ).rows[0] as { id: string };
  const actor = teamActor(user.id);
  const draft = {
    id: legacy.id,
    accountId: team.accountId,
    subject: "Moved",
    bodyHtml: "Body",
    toEmails: [],
    ccEmails: [],
  };
  expect((await saveDraft(ctx.db, { actor, draft }, signal)).ok).toBe(true);
  expect(await listDrafts(ctx.db, actor, signal)).toEqual([
    expect.objectContaining({ id: legacy.id, accountId: team.accountId }),
  ]);
  expect(await listDrafts(ctx.db, teamActor(other.id), signal)).toEqual([]);
  expect(
    (await saveDraft(ctx.db, { actor, draft: { ...draft, subject: "Saved again" } }, signal)).ok,
  ).toBe(true);
  expect(
    (await deleteDraft(ctx.db, { actor: teamActor(other.id), draftId: legacy.id }, signal)).ok,
  ).toBe(false);
  expect((await deleteDraft(ctx.db, { actor, draftId: legacy.id }, signal)).ok).toBe(true);
});
