import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, activityTypes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { localPartsFromIso } from "@/features/deal-workspace/composer/composerHelpers";
import type { PermSetUser } from "@/features/permissions/effective";
import { listActivityRows } from "./activityRows";
import { noFilter } from "./activityRowsTestHelpers";
import { composeDueAt } from "./activityTime";
import { getActivityForEdit } from "./getForEdit";
import { createActivity } from "./repo";

function makeActor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function callType(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("activity type 'call' not found");
  return type;
}

// The reported bug, end to end through a real database: saving with the time blank must not
// come back as a midnight the user never chose.
describe("an activity saved with no time", () => {
  it("round-trips to an empty time field instead of 00:00", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      const due = composeDueAt("2026-08-31", "");

      const created = await createActivity(
        db,
        makeActor(user.id),
        {
          typeId: type.id,
          subject: "Ping",
          dueAt: due.iso,
          allDay: due.allDay,
          assigneeId: user.id,
        },
        signal,
      );
      if (created.ok === false) throw new Error(`createActivity failed: ${created.error.message}`);

      const loaded = await getActivityForEdit(db, makeActor(user.id), created.value.id, signal);
      if (loaded.ok === false) throw new Error("getActivityForEdit failed");
      expect(loaded.value.allDay).toBe(true);
      expect(localPartsFromIso(loaded.value.dueAt, loaded.value.allDay).time).toBe("");
      // The day itself must survive; only the invented time goes.
      expect(localPartsFromIso(loaded.value.dueAt, loaded.value.allDay).date).toBe("2026-08-31");
    });
  });

  it("keeps a time the user did set", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      const due = composeDueAt("2026-08-31", "09:15");

      const created = await createActivity(
        db,
        makeActor(user.id),
        {
          typeId: type.id,
          subject: "Call",
          dueAt: due.iso,
          allDay: due.allDay,
          assigneeId: user.id,
        },
        signal,
      );
      if (created.ok === false) throw new Error("createActivity failed");

      const loaded = await getActivityForEdit(db, makeActor(user.id), created.value.id, signal);
      if (loaded.ok === false) throw new Error("getActivityForEdit failed");
      expect(loaded.value.allDay).toBe(false);
      expect(localPartsFromIso(loaded.value.dueAt, loaded.value.allDay).time).toBe("09:15");
    });
  });

  it("carries the flag onto the list row, so the table can hide the time too", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const user = await seedUser(db, { name: "Owner" });
      const type = await callType(db);
      const due = composeDueAt("2026-08-31", "");
      await db.insert(activities).values({
        typeId: type.id,
        subject: "Ping",
        ownerId: user.id,
        assigneeId: user.id,
        dueAt: due.iso === null ? null : new Date(due.iso),
        allDay: true,
      });

      const rows = await listActivityRows(db, makeActor(user.id), noFilter, signal);
      expect(rows.find((r) => r.subject === "Ping")?.allDay).toBe(true);
    });
  });
});
