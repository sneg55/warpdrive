import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";

it("persists note and location columns on an activity", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not found");

    const [row] = await db
      .insert(activities)
      .values({
        typeId: type.id,
        subject: "Call",
        ownerId: user.id,
        assigneeId: user.id,
        note: "<p>ring back</p>",
        location: "HQ, Room 2",
      })
      .returning();

    expect(row?.note).toBe("<p>ring back</p>");
    expect(row?.location).toBe("HQ, Room 2");
  });
});
