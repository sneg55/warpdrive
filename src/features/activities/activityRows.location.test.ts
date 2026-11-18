import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { listActivityRows } from "./activityRows";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("surfaces the saved location on an activity table row", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { name: "Owner" });
    const actor = makeActor(user.id);
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Site visit",
      ownerId: user.id,
      assigneeId: user.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
      allDay: false,
      location: "HQ, 5th floor",
    });

    const rows = await listActivityRows(
      db,
      actor,
      {
        ownerId: null,
        done: "all",
        from: null,
        to: null,
        dateBasis: "due",
        pipelineId: null,
        typeKey: null,
      },
      signal,
    );
    expect(rows[0]?.location).toBe("HQ, 5th floor");
  });
});
