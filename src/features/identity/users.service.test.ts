import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { users } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listAssignableUsers } from "./users.service";

it("returns only active users, projected to id+name+avatarUrl", async () => {
  await withTestDb(async (db) => {
    const active = await seedUser(db);
    const inactive = await seedUser(db);
    await db.update(users).set({ isActive: false }).where(eq(users.id, inactive.id));

    const rows = await listAssignableUsers(db, AbortSignal.timeout(5000));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
    // Projection is exactly { id, name, avatarUrl }, never the full user row (no email/flags leak).
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["avatarUrl", "id", "name"]);
  });
});

it("listAssignableUsers returns avatarUrl for the owner picker", async () => {
  await withTestDb(async (db) => {
    const withAvatar = await seedUser(db, { avatarUrl: "https://x/a.png" });

    const rows = await listAssignableUsers(db, AbortSignal.timeout(5000));
    const row = rows.find((r) => r.id === withAvatar.id);
    expect(row).toHaveProperty("avatarUrl", "https://x/a.png");
  });
});
