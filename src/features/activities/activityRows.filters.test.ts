import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityTypes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listActivityRows } from "./activityRows";
import { actor, callTypeId, minimalActivityInput, noFilter, sig } from "./activityRowsTestHelpers";
import { createActivity } from "./repo";

// Split out from activityRows.test.ts (same pattern as activityRows.sort.test.ts): each of the
// non-done filter predicates in activityFilterPredicates (ownerId, from/to, typeKey) needs its own
// non-null case to actually exercise the branch, not just the always-null path the other suites use.

async function typeIdByKey(db: Parameters<typeof callTypeId>[0], key: string): Promise<string> {
  const [t] = await db.select().from(activityTypes).where(eq(activityTypes.key, key));
  if (t === undefined) throw new Error(`activity type '${key}' not seeded`);
  return t.id;
}

describe("listActivityRows filter predicates", () => {
  it("ownerId narrows by activities.assigneeId, not the creator", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { name: "Admin", isAdmin: true });
      const ann = await seedUser(db, { name: "Ann" });
      const bob = await seedUser(db, { name: "Bob" });
      const typeId = await callTypeId(db);

      await createActivity(
        db,
        actor(admin.id, true),
        { ...minimalActivityInput(typeId, "Ann's call"), assigneeId: ann.id },
        sig(),
      );
      await createActivity(
        db,
        actor(admin.id, true),
        { ...minimalActivityInput(typeId, "Bob's call"), assigneeId: bob.id },
        sig(),
      );

      // Admin actor so both rows are visible regardless of the filter: any narrowing below is
      // the ownerId predicate itself, not a visibility side effect.
      const rows = await listActivityRows(
        db,
        actor(admin.id, true),
        { ...noFilter, ownerId: ann.id },
        sig(),
      );
      const subjects = rows.map((r) => r.subject);
      expect(subjects).toContain("Ann's call");
      expect(subjects).not.toContain("Bob's call");
    });
  });

  it("from/to narrows dueAt to an inclusive window (gte lower bound, lte upper bound)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const typeId = await callTypeId(db);
      const from = "2026-07-10";
      const to = "2026-07-12";
      // Mirror the production code's own boundary construction (new Date(`${d}T00:00:00`)) so the
      // comparison is exact regardless of the machine's local timezone.
      const lowerMs = new Date(`${from}T00:00:00`).getTime();
      const upperMs = new Date(`${to}T23:59:59`).getTime();

      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "Just before window", {
          dueAt: new Date(lowerMs - 1000).toISOString(),
        }),
        sig(),
      );
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "At lower boundary", {
          dueAt: new Date(lowerMs).toISOString(),
        }),
        sig(),
      );
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "At upper boundary", {
          dueAt: new Date(upperMs).toISOString(),
        }),
        sig(),
      );
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "Just after window", {
          dueAt: new Date(upperMs + 1000).toISOString(),
        }),
        sig(),
      );

      const rows = await listActivityRows(db, actor(u.id), { ...noFilter, from, to }, sig());
      const subjects = rows.map((r) => r.subject);
      // Boundaries included (gte/lte), one tick outside on either side excluded.
      expect(subjects).toContain("At lower boundary");
      expect(subjects).toContain("At upper boundary");
      expect(subjects).not.toContain("Just before window");
      expect(subjects).not.toContain("Just after window");
    });
  });

  it("typeKey narrows to a single activity type", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const callId = await callTypeId(db);
      const meetingId = await typeIdByKey(db, "meeting");

      await createActivity(db, actor(u.id), minimalActivityInput(callId, "Call one"), sig());
      await createActivity(db, actor(u.id), minimalActivityInput(meetingId, "Meeting one"), sig());

      const rows = await listActivityRows(
        db,
        actor(u.id),
        { ...noFilter, typeKey: "meeting" },
        sig(),
      );
      const subjects = rows.map((r) => r.subject);
      expect(subjects).toContain("Meeting one");
      expect(subjects).not.toContain("Call one");
    });
  });
});
