import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { listActorMailboxes } from "./actorMailboxes";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("lists accessible mailbox choices and each unread count without requiring a personal account", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "routing@example.com" });
  const outsider = await seedUser(ctx.db, { email: "routing-other@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  expect(await listActorMailboxes(ctx.db, outsider.id, signal)).toEqual([]);
  expect(await listActorMailboxes(ctx.db, user.id, signal)).toMatchObject([
    { id: accountId, kind: "team", displayName: "Sales", unread: 1 },
  ]);
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  expect(await listActorMailboxes(ctx.db, user.id, signal)).toEqual([]);
});
