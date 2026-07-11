import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { users } from "./identity";
import { activities, activityTypes } from "./index";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

it("seeds the 6 system activity types", async () => {
  const rows = await h.db.select().from(activityTypes).where(eq(activityTypes.isSystem, true));
  expect(rows.map((r) => r.key).sort()).toEqual([
    "call",
    "deadline",
    "email",
    "lunch",
    "meeting",
    "task",
  ]);
});

it("inserts an activity with an owner and assignee, defaulting done to false", async () => {
  // owner_id and assignee_id are NOT NULL FKs to users; seed a real user first.
  const [u] = await h.db
    .insert(users)
    .values({ email: "a@test.com", name: "A", googleSub: "sub-a" })
    .returning();

  const [type] = await h.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));

  const [a] = await h.db
    .insert(activities)
    .values({
      typeId: type!.id,
      subject: "Call Acme",
      ownerId: u!.id,
      assigneeId: u!.id,
      dueAt: new Date("2026-07-02T10:00:00Z"),
      durationMinutes: 30,
    })
    .returning();

  expect(a!.done).toBe(false);
  expect(a!.subject).toBe("Call Acme");
});
