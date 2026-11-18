import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { completeActivity, createActivity } from "./repo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const signal = (): AbortSignal => new AbortController().signal;

async function seedOpenActivity(): Promise<{ actor: PermSetUser; id: string }> {
  const user = await seedUser(ctx.db);
  const actor: PermSetUser = {
    id: user.id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const [deal] = await ctx.db
    .insert(deals)
    .values({
      title: "Idempotent",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (deal === undefined || type === undefined) throw new Error("seed failed");
  const created = await createActivity(
    ctx.db,
    actor,
    {
      typeId: type.id,
      subject: "Call",
      dealId: deal.id,
      dueAt: "2026-07-02T10:00:00.000Z",
      durationMinutes: null,
      personId: null,
      orgId: null,
      guestPersonIds: [],
      participantUserIds: [],
      customFields: {},
    },
    signal(),
  );
  if (!created.ok) throw new Error("activity seed failed");
  return { actor, id: created.value.id };
}

async function readDoneAt(id: string): Promise<Date | null> {
  const [row] = await ctx.db
    .select({ doneAt: activities.doneAt })
    .from(activities)
    .where(eq(activities.id, id));
  return row?.doneAt ?? null;
}

it("marking an already-done activity done again keeps the original completion time", async () => {
  const { actor, id } = await seedOpenActivity();
  const first = await completeActivity(ctx.db, actor, id, true, signal());
  expect(first.ok).toBe(true);
  const stampedAt = await readDoneAt(id);
  expect(stampedAt).not.toBeNull();

  const again = await completeActivity(ctx.db, actor, id, true, signal());
  expect(again.ok).toBe(true);
  if (again.ok) expect(again.value.doneAt?.getTime()).toBe(stampedAt?.getTime());
  expect((await readDoneAt(id))?.getTime()).toBe(stampedAt?.getTime());
});

it("two concurrent mark-done calls stamp the activity once", async () => {
  const { actor, id } = await seedOpenActivity();
  const [a, b] = await Promise.all([
    completeActivity(ctx.db, actor, id, true, signal()),
    completeActivity(ctx.db, actor, id, true, signal()),
  ]);
  expect(a.ok && b.ok).toBe(true);
  if (!a.ok || !b.ok) return;
  expect(a.value.doneAt?.getTime()).toBe(b.value.doneAt?.getTime());
  expect((await readDoneAt(id))?.getTime()).toBe(a.value.doneAt?.getTime());
});

it("reopening an already-open activity succeeds without touching the row", async () => {
  const { actor, id } = await seedOpenActivity();
  const [before] = await ctx.db.select().from(activities).where(eq(activities.id, id));
  const reopened = await completeActivity(ctx.db, actor, id, false, signal());
  expect(reopened.ok).toBe(true);
  if (reopened.ok) expect(reopened.value.done).toBe(false);
  const [after] = await ctx.db.select().from(activities).where(eq(activities.id, id));
  expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
});
