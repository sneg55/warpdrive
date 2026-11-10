import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { parseNotifyPayload } from "@/server/ws/payload";
import { makeTestDb } from "@/test/db";
import { markThreadRead, markThreadUnread } from "./readState";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { archiveThread, unarchiveThread } from "./threadArchive";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("publishes thread updates to every current member channel", async () => {
  const signal = AbortSignal.timeout(8000);
  const first = await seedUser(ctx.db, { email: "realtime-first@example.com" });
  const second = await seedUser(ctx.db, { email: "realtime-second@example.com" });
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [first.id, second.id], signal);
  expect(
    parseNotifyPayload({
      v: 1,
      channel: `user:${first.id}`,
      ts: new Date().toISOString(),
      actorId: first.id,
      type: "email_thread_updated",
      data: { threadId, accountId },
    }).ok,
  ).toBe(true);
  const args = { actor: teamActor(first.id), threadId };
  await markThreadRead(ctx.db, args, signal);
  await markThreadUnread(ctx.db, args, signal);
  await archiveThread(ctx.db, args, signal);
  await unarchiveThread(ctx.db, args, signal);
  const versions = (
    await ctx.db.execute(sql`SELECT channel, version::int FROM channel_versions ORDER BY channel`)
  ).rows;
  expect(versions).toEqual(
    [first.id, second.id].sort().map((id) => ({ channel: `user:${id}`, version: 4 })),
  );
});
