import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listActivityRows } from "./activityRows";
import { actor, callTypeId, minimalActivityInput, noFilter, sig } from "./activityRowsTestHelpers";
import { createActivity } from "./repo";

describe("listActivityRows ordering", () => {
  it("defaults to due date ascending, nulls last, id as tiebreaker", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const typeId = await callTypeId(db);
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "C - later due", { dueAt: "2026-07-12T10:00:00.000Z" }),
        sig(),
      );
      await createActivity(db, actor(u.id), minimalActivityInput(typeId, "A - no due date"), sig());
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "B - earlier due", { dueAt: "2026-07-10T10:00:00.000Z" }),
        sig(),
      );

      const rows = await listActivityRows(db, actor(u.id), noFilter, sig());
      expect(rows.map((r) => r.subject)).toEqual([
        "B - earlier due",
        "C - later due",
        "A - no due date",
      ]);
    });
  });

  it("sorts by subject when an explicit sort is requested", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const typeId = await callTypeId(db);
      for (const subject of ["Charlie", "Alpha", "Bravo"]) {
        await createActivity(db, actor(u.id), minimalActivityInput(typeId, subject), sig());
      }

      const asc = await listActivityRows(db, actor(u.id), noFilter, sig(), {
        field: "subject",
        dir: "asc",
      });
      expect(asc.map((r) => r.subject)).toEqual(["Alpha", "Bravo", "Charlie"]);

      const desc = await listActivityRows(db, actor(u.id), noFilter, sig(), {
        field: "subject",
        dir: "desc",
      });
      expect(desc.map((r) => r.subject)).toEqual(["Charlie", "Bravo", "Alpha"]);
    });
  });

  it("sorts by priority when an explicit sort is requested (nulls last, id tiebreaker)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const typeId = await callTypeId(db);
      const fixtures: [string, string | null][] = [
        ["Low one", "low"],
        ["No priority", null],
        ["High one", "high"],
      ];
      for (const [subject, priority] of fixtures) {
        await createActivity(
          db,
          actor(u.id),
          minimalActivityInput(typeId, subject, { priority }),
          sig(),
        );
      }

      const rows = await listActivityRows(db, actor(u.id), noFilter, sig(), {
        field: "priority",
        dir: "asc",
      });
      // Alphabetical on the raw key ("high" < "low"), nulls sort last (Postgres ASC default).
      expect(rows.map((r) => r.subject)).toEqual(["High one", "Low one", "No priority"]);
    });
  });

  it("sorts by duration when an explicit sort is requested (nulls last, id tiebreaker)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const typeId = await callTypeId(db);
      const fixtures: [string, number | null][] = [
        ["Long one", 60],
        ["No duration", null],
        ["Short one", 15],
      ];
      for (const [subject, durationMinutes] of fixtures) {
        await createActivity(
          db,
          actor(u.id),
          minimalActivityInput(typeId, subject, { durationMinutes }),
          sig(),
        );
      }

      const asc = await listActivityRows(db, actor(u.id), noFilter, sig(), {
        field: "duration",
        dir: "asc",
      });
      expect(asc.map((r) => r.subject)).toEqual(["Short one", "Long one", "No duration"]);

      // Postgres's DESC default is NULLS FIRST (the mirror image of ASC's NULLS LAST above).
      const desc = await listActivityRows(db, actor(u.id), noFilter, sig(), {
        field: "duration",
        dir: "desc",
      });
      expect(desc.map((r) => r.subject)).toEqual(["No duration", "Long one", "Short one"]);
    });
  });

  it("sorts by due date descending when an explicit sort is requested", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const typeId = await callTypeId(db);
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "Earlier", { dueAt: "2026-07-10T10:00:00.000Z" }),
        sig(),
      );
      await createActivity(
        db,
        actor(u.id),
        minimalActivityInput(typeId, "Later", { dueAt: "2026-07-12T10:00:00.000Z" }),
        sig(),
      );

      const rows = await listActivityRows(db, actor(u.id), noFilter, sig(), {
        field: "dueAtIso",
        dir: "desc",
      });
      expect(rows.map((r) => r.subject)).toEqual(["Later", "Earlier"]);
    });
  });
});
