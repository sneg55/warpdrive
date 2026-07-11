import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { getBusyWindows } from "./availability";
import { createActivity } from "./repo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(user: { id: string; isAdmin: boolean }): PermSetUser {
  return {
    id: user.id,
    type: user.isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

const SIG = () => new AbortController().signal;

it("reports busy inside an activity window and free outside it", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const [deal] = await ctx.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");
  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (!type) throw new Error("activity type 'call' not found");

  // A 10:00-10:30 activity (assigned to the user by default: assigneeId falls back to actor.id).
  await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Standup",
      dealId: deal.id,
      dueAt: "2026-07-10T10:00:00.000Z",
      durationMinutes: 30,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    SIG(),
  );

  const busy = await getBusyWindows(
    ctx.db,
    {
      userId: user.id,
      from: new Date("2026-07-10T10:15:00.000Z"),
      to: new Date("2026-07-10T10:15:00.000Z"),
    },
    SIG(),
  );
  expect(busy.length).toBe(1);

  const free = await getBusyWindows(
    ctx.db,
    {
      userId: user.id,
      from: new Date("2026-07-10T11:00:00.000Z"),
      to: new Date("2026-07-10T11:00:00.000Z"),
    },
    SIG(),
  );
  expect(free.length).toBe(0);
});
