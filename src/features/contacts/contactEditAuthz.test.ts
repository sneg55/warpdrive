import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createOrg, updateOrg } from "./orgsRepo";
import { type ContactActor, createPerson, updatePerson } from "./personsRepo";

// Codex finding F2: updatePerson/updateOrg gated on canSee ONLY, never on the
// contact.edit capability (an ownership-scoped flag, permissions spec §3.3). A user
// with read visibility but no edit capability could modify a visible contact.

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

function actor(id: string, flags: PermissionFlagKey[]): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
    primaryVisibilityGroupId: null,
  };
}

async function seedAllVisible(db: Db): Promise<void> {
  // "all" level => a created record is visible to every user (so a non-owner can see it).
  await db.insert(settings).values({
    id: true,
    baseCurrency: "USD",
    defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
  });
}

describe("contact edit authorization", () => {
  it("denies a visible non-owner without contact.edit from updating a person", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await seedAllVisible(db);
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const created = await createPerson(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Target", emails: [], phones: [], orgId: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      // `other` can SEE the person (all-level) but has no contact.edit flag.
      const r = await updatePerson(
        db,
        actor(other.id, []),
        { id: created.value.id, name: "Hijacked" },
        signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });

  it("allows contact.edit_any to update a visible non-owned person", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await seedAllVisible(db);
      const owner = await seedUser(db);
      const editor = await seedUser(db);
      const created = await createPerson(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Target", emails: [], phones: [], orgId: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await updatePerson(
        db,
        actor(editor.id, ["contact.edit_any"]),
        { id: created.value.id, name: "Edited" },
        signal,
      );
      expect(r.ok).toBe(true);
    });
  });

  it("allows an owner with contact.edit_own to update their own person", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await seedAllVisible(db);
      const owner = await seedUser(db);
      const created = await createPerson(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Mine", emails: [], phones: [], orgId: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await updatePerson(
        db,
        actor(owner.id, ["contact.edit_own"]),
        { id: created.value.id, name: "Renamed" },
        signal,
      );
      expect(r.ok).toBe(true);
    });
  });

  it("denies a visible non-owner without contact.edit from updating an org", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await seedAllVisible(db);
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const created = await createOrg(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Acme", address: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await updateOrg(
        db,
        actor(other.id, []),
        { id: created.value.id, name: "Hijacked" },
        signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");
    });
  });
});
