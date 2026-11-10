import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { decryptToken } from "./crypto";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";
import { updateTeamMailbox } from "./teamMailboxAdmin";
import { exchangeTeamMailbox } from "./teamMailboxConnect";
import { consumeTeamMailboxIntent, createTeamMailboxIntent } from "./teamMailboxIntent";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});
const deps = (email: string, hd = "example.com", token = "secret") => ({
  exchangeCode: () =>
    Promise.resolve(ok({ accessToken: "access", refreshToken: token, scopes: ["gmail.send"] })),
  fetchIdentity: () => Promise.resolve(ok({ email, emailVerified: true, hd })),
});

it("requires admin and Workspace identity, protects personal collisions and reconnects teams", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "connect@example.com" });
  const args = {
    db: ctx.db,
    actorId: user.id,
    code: "code",
    backfillDays: 90,
    deps: deps("sales@example.com"),
    signal,
  };
  const denied = await exchangeTeamMailbox(args);
  expect(denied.ok ? null : denied.error.id).toBe("E_PERM_006");
  await ctx.db.execute(sql`UPDATE users SET is_admin=true WHERE id=${user.id}`);
  const wrong = await exchangeTeamMailbox({
    ...args,
    deps: deps("sales@example.com", "other.com"),
  });
  expect(wrong.ok ? null : wrong.error.id).toBe("E_AUTH_001");
  await ctx.db.execute(
    sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${user.id}, 'personal@example.com')`,
  );
  const collision = await exchangeTeamMailbox({ ...args, deps: deps("personal@example.com") });
  expect(collision.ok ? null : collision.error.id).toBe("E_GMAIL_027");
  expect(
    (
      await ctx.db.execute(
        sql`SELECT refresh_token_enc FROM email_accounts WHERE user_id=${user.id}`,
      )
    ).rows[0]?.refresh_token_enc,
  ).toBeNull();
  const connected = await exchangeTeamMailbox(args);
  expect(connected.ok).toBe(true);
  const again = await exchangeTeamMailbox({
    ...args,
    backfillDays: 30,
    deps: deps("sales@example.com", "example.com", "refreshed"),
  });
  expect(again).toEqual(connected);
  const row = (
    await ctx.db.execute(
      sql`SELECT user_id, kind, refresh_token_enc, backfill_days FROM email_accounts WHERE email_address='sales@example.com'`,
    )
  ).rows[0] as {
    user_id: string | null;
    kind: string;
    refresh_token_enc: Buffer;
    backfill_days: number;
  };
  expect(row).toMatchObject({ user_id: null, kind: "team", backfill_days: 90 });
  expect(decryptToken(row.refresh_token_enc)).toEqual({ ok: true, value: "refreshed" });
});

it("consumes team intent only in the initiating session and only once", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "intent@example.com", isAdmin: true });
  const sessions = await ctx.db.execute(sql`INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ('intent-first', ${user.id}, now() + interval '1 day'), ('intent-second', ${user.id}, now() + interval '1 day') RETURNING id`);
  const first = sessions.rows[0]?.id as string;
  const second = sessions.rows[1]?.id as string;
  const intent = await createTeamMailboxIntent(
    ctx.db,
    { actorId: user.id, sessionId: first, backfillDays: 90 },
    signal,
  );
  expect(intent.ok).toBe(true);
  if (!intent.ok) return;
  expect(await consumeTeamMailboxIntent(ctx.db, intent.value, second, signal)).toBeNull();
  expect(await consumeTeamMailboxIntent(ctx.db, intent.value, first, signal)).toEqual({
    backfillDays: 90,
  });
  expect(await consumeTeamMailboxIntent(ctx.db, intent.value, first, signal)).toBeNull();
});

it("allows only admins to manage team settings", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "manage@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  const args = { actorId: user.id, accountId, displayName: "Partnerships", overdueAfterHours: 48 };
  expect((await updateTeamMailbox(ctx.db, args, signal)).ok).toBe(false);
  await ctx.db.execute(sql`UPDATE users SET is_admin=true WHERE id=${user.id}`);
  expect((await updateTeamMailbox(ctx.db, args, signal)).ok).toBe(true);
  expect(
    (
      await ctx.db.execute(
        sql`SELECT display_name, overdue_after_hours FROM email_accounts WHERE id=${accountId}`,
      )
    ).rows[0],
  ).toEqual({ display_name: "Partnerships", overdue_after_hours: 48 });
});
