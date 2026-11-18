import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { trashThreadAction } from "./actions";
import { seedAgenticMailbox } from "./agentic.test-helpers";
import { encryptToken } from "./crypto";
import { FakeGmailClient } from "./gmailFake";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { trashThread } from "./threadTrash";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let actor: AuthUser | null = null;
vi.mock("@/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: () => Promise.resolve({ actor }),
}));
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await ctx.close();
});

it("allows a current team member to trash through the domain service", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const outsider = await seedUser(ctx.db, { isAdmin: true });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  const gmail = new FakeGmailClient();
  expect(
    (await trashThread(ctx.db, { actor: teamActor(outsider.id, "admin"), threadId, gmail }, signal))
      .ok,
  ).toBe(false);
  expect(gmail.calls).toEqual([]);
  expect(
    (await trashThread(ctx.db, { actor: teamActor(member.id), threadId, gmail }, signal)).ok,
  ).toBe(true);
  expect(
    (await ctx.db.execute(sql`SELECT trashed_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.trashed_at,
  ).not.toBeNull();
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  gmail.calls.length = 0;
  expect(
    (await trashThread(ctx.db, { actor: teamActor(member.id), threadId, gmail }, signal)).ok,
  ).toBe(false);
  expect(gmail.calls).toEqual([]);
});

it("authorizes the reader trash action before refreshing tokens or calling Gmail", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const outsider = await seedUser(ctx.db, { isAdmin: true });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  await ctx.db.execute(
    sql`UPDATE email_accounts SET refresh_token_enc=${encryptToken("test-refresh")} WHERE id=${accountId}`,
  );
  const http = vi.fn((url: string) => {
    if (url.includes("oauth2.googleapis.com"))
      return Promise.resolve(Response.json({ access_token: "test-access", expires_in: 3600 }));
    if (url.endsWith(`/threads/${threadId}/trash`))
      return Promise.resolve(Response.json({ id: threadId }));
    throw new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "unexpected test request", {});
  });
  vi.stubGlobal("fetch", http);
  actor = teamActor(outsider.id, "admin");
  expect((await trashThreadAction("csrf", { threadId })).ok).toBe(false);
  expect(http).not.toHaveBeenCalled();
  actor = teamActor(member.id);
  expect((await trashThreadAction("csrf", { threadId })).ok).toBe(true);
  expect(http).toHaveBeenCalledTimes(2);
  expect(
    (await ctx.db.execute(sql`SELECT trashed_at FROM email_threads WHERE id=${threadId}`)).rows[0]
      ?.trashed_at,
  ).not.toBeNull();
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  http.mockClear();
  expect((await trashThreadAction("csrf", { threadId })).ok).toBe(false);
  expect(http).not.toHaveBeenCalled();
});

it("trash on an agentic thread returns E_AINBOX_012", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const accountId = await seedAgenticMailbox(
    ctx.db,
    { address: "media@example.com", baseUrl: "https://inbox.example", memberIds: [member.id] },
    signal,
  );
  const thread = (
    await ctx.db.execute(sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, last_message_at)
      VALUES (${accountId}, 'agentic-thread', 'Hello', now()) RETURNING id`)
  ).rows[0] as { id: string };
  const http = vi.fn();
  vi.stubGlobal("fetch", http);
  actor = teamActor(member.id);

  const r = await trashThreadAction("csrf", { threadId: thread.id });
  expect(r.ok ? null : r.error.id).toBe("E_AINBOX_012");
  expect(http).not.toHaveBeenCalled();
  expect(
    (await ctx.db.execute(sql`SELECT trashed_at FROM email_threads WHERE id=${thread.id}`)).rows[0]
      ?.trashed_at,
  ).toBeNull();
});
