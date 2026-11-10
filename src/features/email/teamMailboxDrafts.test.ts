import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { listDrafts, patchDraft, saveDraft } from "./draftRepo";
import { listOutbox } from "./folderReads";
import { cancelOutbox } from "./outboxCancel";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { setTeamMailboxMembers } from "./teamMailboxMembers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("keeps drafts and queued sends private to their author and cleans them on removal", async () => {
  const signal = AbortSignal.timeout(8000);
  const first = await seedUser(ctx.db, { email: "draft-first@example.com", isAdmin: true });
  const second = await seedUser(ctx.db, { email: "draft-second@example.com" });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [first.id, second.id], signal);
  const actor = teamActor(first.id, "admin");
  const other = teamActor(second.id);
  const saved = await saveDraft(
    ctx.db,
    {
      actor,
      draft: {
        accountId,
        threadId,
        subject: "Private draft",
        bodyHtml: "Secret",
        toEmails: ["customer@external.com"],
        ccEmails: [],
      },
    },
    signal,
  );
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;
  expect((await listDrafts(ctx.db, actor, signal)).map((d) => d.id)).toEqual([saved.value.id]);
  expect(await listDrafts(ctx.db, other, signal)).toEqual([]);
  expect(
    (
      await patchDraft(
        ctx.db,
        { actor: other, draftId: saved.value.id, patch: { subject: "stolen" } },
        signal,
      )
    ).ok,
  ).toBe(false);
  const queued =
    await ctx.db.execute(sql`INSERT INTO email_send_attempts (account_id, idempotency_key, message_id_header, payload)
    VALUES (${accountId}, ${randomUUID()}, ${randomUUID()}, ${JSON.stringify({ actorId: first.id, to: ["customer@external.com"], subject: "Queued", html: "" })}::jsonb) RETURNING id`);
  const attemptId = queued.rows[0]?.id as string;
  expect((await listOutbox(ctx.db, actor, signal)).map((s) => s.id)).toEqual([attemptId]);
  expect(await listOutbox(ctx.db, other, signal)).toEqual([]);
  expect((await cancelOutbox(ctx.db, { actor: other, attemptId }, signal)).ok).toBe(false);
  expect(
    (
      await setTeamMailboxMembers(
        ctx.db,
        { actorId: first.id, accountId, userIds: [second.id] },
        signal,
      )
    ).ok,
  ).toBe(true);
  expect(
    (await ctx.db.execute(sql`SELECT id FROM email_drafts WHERE account_id=${accountId}`)).rows,
  ).toEqual([]);
  expect(
    (await ctx.db.execute(sql`SELECT id FROM email_send_attempts WHERE account_id=${accountId}`))
      .rows,
  ).toEqual([]);
});
