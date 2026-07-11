import { expect, it } from "vitest";
import { visibilityGroups } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { loadImportActor } from "./importActor";

it("hydrates an import actor from a userId, null for unknown", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const actor = await loadImportActor(db, user.id, AbortSignal.timeout(5000));
    expect(actor?.id).toBe(user.id);
    expect(actor?.primaryVisibilityGroupId).toBeNull();
    const none = await loadImportActor(
      db,
      "00000000-0000-0000-0000-000000000000",
      AbortSignal.timeout(5000),
    );
    expect(none).toBeNull();
  });
});

// Regression: when the org's default deal/lead visibility is "group", commitLead/commitDeal call
// resolveVisibilityGroup, which rejects with E_PERM_003 unless the actor carries a primary group.
// The background import actor must therefore load the user's REAL primaryVisibilityGroupId, not a
// hardcoded null, or every lead/deal import fails for a user whose primary group is set.
it("carries the user's real primary visibility group into the import actor", async () => {
  await withTestDb(async (db) => {
    const [group] = await db
      .insert(visibilityGroups)
      .values({ name: `grp-${Date.now()}` })
      .returning();
    const user = await seedUser(db, { primaryVisibilityGroupId: group?.id });
    const actor = await loadImportActor(db, user.id, AbortSignal.timeout(5000));
    expect(actor?.primaryVisibilityGroupId).toBe(group?.id);
  });
});
