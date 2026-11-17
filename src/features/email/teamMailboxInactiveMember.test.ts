import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";
import { listTeamMailboxSettings } from "./teamMailboxAdmin";
import { setTeamMailboxMembers } from "./teamMailboxMembers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("a deactivated member does not block saving the member list the settings page shows", async () => {
  const signal = AbortSignal.timeout(8000);
  const admin = await seedUser(ctx.db, { isAdmin: true });
  const departed = await seedUser(ctx.db, { isActive: false });
  const newcomer = await seedUser(ctx.db);
  const { accountId } = await seedTeamMailbox(ctx.db, [admin.id, departed.id], signal);

  const settings = await listTeamMailboxSettings(ctx.db, admin.id, signal);
  if (!settings.ok) throw new Error("expected ok");
  const shown = settings.value.find((m) => m.id === accountId);
  expect(shown?.member_ids).toEqual([admin.id]);

  const saved = await setTeamMailboxMembers(
    ctx.db,
    { actorId: admin.id, accountId, userIds: [...(shown?.member_ids ?? []), newcomer.id] },
    signal,
  );
  expect(saved.ok).toBe(true);
});
