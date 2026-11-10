import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { canSeeEmail } from "./emailVisibility";
import { assertMailboxOwner } from "./mailboxOwnership";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("grants private unlinked team mail only to current members without an admin bypass", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db, { email: "member@example.com" });
  const outsider = await seedUser(ctx.db, { email: "outsider@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  const thread = { accountId, visibility: "private", dealId: null, personId: null };
  expect(await canSeeEmail(ctx.db, teamActor(member.id), thread, signal)).toBe(true);
  expect(await canSeeEmail(ctx.db, teamActor(outsider.id), thread, signal)).toBe(false);
  expect(await canSeeEmail(ctx.db, teamActor(outsider.id, "admin"), thread, signal)).toBe(false);
  expect((await assertMailboxOwner(ctx.db, accountId, member.id, signal)).ok).toBe(true);
  const denied = await assertMailboxOwner(ctx.db, accountId, outsider.id, signal);
  expect(denied.ok).toBe(false);
  if (!denied.ok) expect(denied.error.id).toBe("E_PERM_007");
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  expect(await canSeeEmail(ctx.db, teamActor(member.id), thread, signal)).toBe(false);
  expect((await assertMailboxOwner(ctx.db, accountId, member.id, signal)).ok).toBe(false);
});
