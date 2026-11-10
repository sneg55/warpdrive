import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";
import { getThreadNeighbors } from "./threadNeighbors";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("navigates only the current team mailbox for members", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "neighbors@example.com" });
  const outsider = await seedUser(ctx.db, { email: "neighbors-other@example.com" });
  const first = await seedTeamMailbox(ctx.db, [user.id], signal);
  await seedTeamMailbox(ctx.db, [user.id], signal);
  const args = { actor: teamActor(user.id), threadId: first.threadId, folder: "inbox" as const };
  expect(await getThreadNeighbors(ctx.db, args, signal)).toEqual({
    prevId: null,
    nextId: null,
    index: 1,
    total: 1,
  });
  expect(
    await getThreadNeighbors(ctx.db, { ...args, actor: teamActor(outsider.id) }, signal),
  ).toBeNull();
});
