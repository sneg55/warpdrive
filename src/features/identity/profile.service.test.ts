import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { users } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { updateUserProfile } from "./profile.service";

describe("updateUserProfile", () => {
  it("persists the new display name", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { name: "Old Name" });

      const r = await updateUserProfile(
        db,
        { actorId: u.id, name: "Real Name" },
        AbortSignal.timeout(2000),
      );

      expect(r.ok).toBe(true);
      const [after] = await db.select().from(users).where(eq(users.id, u.id));
      expect(after?.name).toBe("Real Name");
    });
  });

  it("rejects a blank name with USER_PROFILE_INVALID and leaves the row untouched", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { name: "Old Name" });

      const r = await updateUserProfile(
        db,
        { actorId: u.id, name: "   " },
        AbortSignal.timeout(2000),
      );

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.USER_PROFILE_INVALID);
      const [after] = await db.select().from(users).where(eq(users.id, u.id));
      expect(after?.name).toBe("Old Name");
    });
  });
});
