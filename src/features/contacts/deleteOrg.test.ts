import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { organizations } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { deleteOrg } from "./deleteOrg";
import { createOrg, listOrgs } from "./orgsRepo";
import type { ContactActor } from "./personsRepo";

function actor(id: string, flags: PermissionFlagKey[] = []): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
    primaryVisibilityGroupId: null,
  };
}

describe("deleteOrg", () => {
  it("soft-deletes an org the actor can delete, dropping it from listOrgs", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const created = await createOrg(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Target Org", address: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await deleteOrg(
        db,
        actor(owner.id, ["contact.delete_own"]),
        created.value.id,
        signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.id).toBe(created.value.id);

      const [row] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, created.value.id));
      expect(row?.deletedAt).not.toBeNull();

      const list = await listOrgs(db, actor(owner.id, []), { offset: 0, limit: 50 }, signal);
      expect(list.rows.map((o) => o.id)).not.toContain(created.value.id);
    });
  });

  it("404s (CONTACT_NOT_FOUND) for a stranger who cannot see the org", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const created = await createOrg(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Private Org", address: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await deleteOrg(db, actor(stranger.id, []), created.value.id, signal);
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_CONTACT_001");
    });
  });

  // Critical (Task 19's Codex-caught gap, mirrored here): contact.delete is a distinct,
  // admin-configurable permission from contact.edit (REGULAR_DEFAULT_FLAGS grants
  // contact.edit_own but intentionally withholds every delete flag). An owner who can see
  // and edit their own org must NOT get delete for free just because the record is visible.
  it("denies the owner from deleting their own visible org when they lack a delete flag", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const created = await createOrg(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Target Org", address: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      // Owner can see (owns) and can edit (edit_own), but was never granted a delete flag.
      const r = await deleteOrg(
        db,
        actor(owner.id, ["contact.edit_own"]),
        created.value.id,
        signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");

      const [row] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, created.value.id));
      expect(row?.deletedAt).toBeNull();
    });
  });
});
