import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("preserves personal defaults and accepts multiple ownerless team mailboxes", async () => {
  const user = await seedUser(ctx.db, { email: "schema@example.com" });
  const personal = await ctx.db.execute(sql`
    INSERT INTO email_accounts (user_id, email_address)
    VALUES (${user.id}, 'personal@example.com') RETURNING kind, overdue_after_hours
  `);
  expect(personal.rows[0]).toEqual({ kind: "personal", overdue_after_hours: 24 });
  const teams = await ctx.db.execute(sql`
    INSERT INTO email_accounts (kind, email_address)
    VALUES ('team', 'sales@example.com'), ('team', 'partners@example.com') RETURNING user_id
  `);
  expect(teams.rows).toEqual([{ user_id: null }, { user_id: null }]);
  await expect(
    ctx.db.execute(sql`
    INSERT INTO email_accounts (email_address) VALUES ('invalid@example.com')
  `),
  ).rejects.toThrow();
  await expect(
    ctx.db.execute(sql`
    INSERT INTO email_accounts (kind, user_id, email_address)
    VALUES ('team', ${user.id}, 'invalid-team@example.com')
  `),
  ).rejects.toThrow();
});

it("cascades membership and exposes nullable attribution and shared read fields", async () => {
  const user = await seedUser(ctx.db, { email: "member-schema@example.com" });
  const account = await ctx.db.execute(sql`
    INSERT INTO email_accounts (kind, email_address) VALUES ('team', 'schema-team@example.com')
    RETURNING id, backfill_status, backfill_page_token, backfill_error_id
  `);
  const row = account.rows[0] as { id: string };
  expect(account.rows[0]).toMatchObject({
    backfill_status: null,
    backfill_page_token: null,
    backfill_error_id: null,
  });
  await ctx.db.execute(sql`INSERT INTO email_account_members VALUES (${row.id}, ${user.id})`);
  await ctx.db.execute(sql`DELETE FROM email_accounts WHERE id=${row.id}`);
  expect(
    (await ctx.db.execute(sql`SELECT * FROM email_account_members WHERE account_id=${row.id}`))
      .rows,
  ).toEqual([]);
  const fields = await ctx.db.execute(sql`
    SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND
    ((table_name='email_threads' AND column_name IN ('last_inbound_at', 'team_read_at', 'team_read_by_user_id'))
    OR (table_name='email_messages' AND column_name='sent_by_user_id')
    OR (table_name='email_drafts' AND column_name='author_user_id'))
  `);
  expect(fields.rows).toHaveLength(5);
});
