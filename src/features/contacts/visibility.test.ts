import { expect, it } from "vitest";
import { settings, visibilityGroups } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { ContactActor } from "./personsRepo";
import { deriveContactVisibility } from "./visibility";

function makeActor(id: string, primaryVisibilityGroupId: string | null): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
    primaryVisibilityGroupId,
  };
}

// Seed the settings singleton with group-level defaults for person + organization.
async function seedGroupSettings(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
): Promise<void> {
  await db.insert(settings).values({
    id: true,
    defaultVisibilityLevels: { deal: "owner", person: "group", organization: "group" },
  });
}

it("Case A: group level with a resolvable primary group -> ok with that group", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    await seedGroupSettings(db);

    const [grp] = await db.insert(visibilityGroups).values({ name: "Sales East" }).returning();
    if (grp === undefined) throw new Error("group seed failed");

    const me = await seedUser(db);
    const actor = makeActor(me.id, grp.id);

    const r = await deriveContactVisibility(db, actor, "person", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.level).toBe("group");
      expect(r.value.visibilityGroupId).toBe(grp.id);
    }
  });
});

it("Case B: group level with no resolvable group -> E_PERM_003", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    await seedGroupSettings(db);

    const me = await seedUser(db);
    const actor = makeActor(me.id, null);

    const r = await deriveContactVisibility(db, actor, "organization", signal);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_PERM_003");
  });
});

it("Case C: empty settings (owner default) -> ok with owner and null group", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;

    const me = await seedUser(db);
    const actor = makeActor(me.id, null);

    const r = await deriveContactVisibility(db, actor, "person", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.level).toBe("owner");
      expect(r.value.visibilityGroupId).toBe(null);
    }
  });
});
