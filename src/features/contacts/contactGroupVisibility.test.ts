import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { persons, settings, visibilityGroups } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
import { loadContactActor } from "./actorAdapters";
import { createPerson } from "./personsRepo";
import { personCreateInput } from "./schemas";

// Regression: the interactive create-person/org path built its ContactActor via toContactActor,
// which hardcoded primaryVisibilityGroupId to null. When the org's default person visibility is
// "group", deriveContactVisibility rejects with E_PERM_003 unless the actor carries a primary
// group, so every contact create would fail (dormant while the default is "all"). The create path
// must load the user's real group via loadContactActor. Same class as the import-actor bug.
it("loadContactActor carries the user's real primary visibility group", async () => {
  await withTestDb(async (db) => {
    const [group] = await db
      .insert(visibilityGroups)
      .values({ name: `grp-${Date.now()}` })
      .returning();
    const user = await seedUser(db, { primaryVisibilityGroupId: group?.id });
    const perm = await hydrateActor(db, user.id, AbortSignal.timeout(5000));
    const actor = await loadContactActor(db, perm!, AbortSignal.timeout(5000));
    expect(actor.primaryVisibilityGroupId).toBe(group?.id);
  });
});

it("creates a group-scoped person when the person default visibility is 'group'", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(5000);
    await db.insert(settings).values({
      id: true,
      defaultVisibilityLevels: { deal: "owner", person: "group", organization: "all" },
    });
    const [group] = await db
      .insert(visibilityGroups)
      .values({ name: `grp-${Date.now()}` })
      .returning();
    const user = await seedUser(db, {
      isAdmin: true,
      primaryVisibilityGroupId: group?.id,
    });
    const perm = await hydrateActor(db, user.id, signal);
    const actor = await loadContactActor(db, perm!, signal);

    const r = await createPerson(
      db,
      actor,
      personCreateInput.parse({ name: "Group Person" }),
      signal,
    );

    expect(r.ok).toBe(true);
    const [person] = await db
      .select()
      .from(persons)
      .where(eq(persons.id, r.ok ? r.value.id : ""));
    expect(person?.visibilityLevel).toBe("group");
    expect(person?.visibilityGroupId).toBe(group?.id);
  });
});
