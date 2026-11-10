import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { resolveLink } from "./linking";
import { mailboxVisibility } from "./mailboxVisibility";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("links against the union of current member visibility without choosing an arbitrary member", async () => {
  const signal = AbortSignal.timeout(8000);
  const first = await seedUser(ctx.db, { email: "link-first@example.com" });
  const second = await seedUser(ctx.db, { email: "link-second@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [first.id, second.id], signal);
  const one =
    await ctx.db.execute(sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
    VALUES ('One', 'contact@external.com', ${second.id}, 'owner') RETURNING id`);
  const visible = await mailboxVisibility(ctx.db, accountId, signal);
  const args = {
    visible,
    participants: ["contact@external.com"],
    fromEmail: "contact@external.com",
  };
  expect(await resolveLink(ctx.db, args, signal)).toMatchObject({
    kind: "linked",
    personId: one.rows[0]?.id,
  });
  await ctx.db.execute(sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level)
    VALUES ('Two', 'contact@external.com', ${first.id}, 'owner')`);
  expect(await resolveLink(ctx.db, args, signal)).toMatchObject({ kind: "ambiguous_contact" });
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  expect(
    await resolveLink(
      ctx.db,
      { ...args, visible: await mailboxVisibility(ctx.db, accountId, signal) },
      signal,
    ),
  ).toEqual({ kind: "unmatched" });
});
