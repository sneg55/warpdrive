import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { activities, activityTypes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { withLoggedTestDb } from "@/db/testing/queryLog";
import { createCaller } from "@/server/trpc/root";

const ARGENTINA = "America/Argentina/Buenos_Aires";
const LEGACY_ARGENTINA = "America/Buenos_Aires";
const RANGE = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-07T23:59:59.999Z" };
const ARGENTINE_EVENING = new Date("2026-09-03T01:30:00.000Z");

async function seedLateCall(db: Db) {
  const user = await seedUser(db, { name: "Owner" });
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  await db.insert(activities).values({
    typeId: type?.id ?? "",
    subject: "Late call",
    ownerId: user.id,
    assigneeId: user.id,
    dueAt: ARGENTINE_EVENING,
  });
  return createCaller({
    db,
    session: { userId: user.id, sessionId: "s" },
    actor: {
      id: user.id,
      type: "admin",
      isActive: true,
      name: "Owner",
      email: "owner@example.com",
      avatarUrl: null,
      flags: new Set(),
      groupIds: new Set<string>(),
    },
  });
}

describe("activities.dayLoad time zone", () => {
  it("sends Postgres the primary name for the legacy browser zone America/Buenos_Aires", async () => {
    await withLoggedTestDb(async (db, queryParams) => {
      const caller = await seedLateCall(db);
      const out = await caller.activities.dayLoad({ ...RANGE, timeZone: LEGACY_ARGENTINA });
      expect(out.counts).toEqual({ "2026-09-02": 1 });
      expect(queryParams.flat()).toContain(ARGENTINA);
      expect(queryParams.flat()).not.toContain(LEGACY_ARGENTINA);
    });
  });

  it("counts by UTC day for a zone the browser knows but Postgres does not", async () => {
    await withTestDb(async (db) => {
      const caller = await seedLateCall(db);
      const out = await caller.activities.dayLoad({ ...RANGE, timeZone: "US/Pacific-New" });
      expect(out.counts).toEqual({ "2026-09-03": 1 });
    });
  });
});
