import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, leads, settings, visibilityGroups } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { commitRow } from "./commit";
import { loadImportActor } from "./importActor";

// Regression for the prod incident where a 115-row lead import landed every row "invalid" with
// E_PERM_003. The org's default deal visibility was "group"; createLead derives lead visibility
// from that default and calls resolveVisibilityGroup, which rejects unless the actor carries a
// primary group. The background import actor (loadImportActor) hardcoded primaryVisibilityGroupId
// to null, so every row failed even though the importing user's primary group was set. Build the
// actor through the REAL loadImportActor path so the fix (loading the user's group) is exercised.
it("commits a lead when the deal default visibility is 'group' and the user has a primary group", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(5000);
    await db.insert(settings).values({
      id: true,
      defaultVisibilityLevels: { deal: "group", person: "all", organization: "all" },
    });
    const [group] = await db
      .insert(visibilityGroups)
      .values({ name: `grp-${Date.now()}` })
      .returning();
    const user = await seedUser(db, { isAdmin: true, primaryVisibilityGroupId: group?.id });

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "lead", filename: "l.csv", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: { primary: { title: "Group-scoped lead" } },
        status: "valid",
      })
      .returning();

    const actor = await loadImportActor(db, user.id, signal);
    const r = await commitRow(db, actor!, row!.id, "lead", "skip", signal);

    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");
    const [lead] = await db.select().from(leads).where(eq(leads.title, "Group-scoped lead"));
    expect(lead?.visibilityLevel).toBe("group");
    expect(lead?.visibilityGroupId).toBe(group?.id);
  });
});
