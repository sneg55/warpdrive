import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { deletePerson } from "./deletePerson";
import { listPeople } from "./listPeople";
import { type ContactActor, createPerson } from "./personsRepo";

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

describe("deletePerson", () => {
  it("soft-deletes a person the actor can delete, dropping it from listPeople", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const created = await createPerson(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Target", emails: [], phones: [], orgId: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await deletePerson(
        db,
        actor(owner.id, ["contact.delete_own"]),
        created.value.id,
        signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;
      expect(r.value.id).toBe(created.value.id);

      const [row] = await db.select().from(persons).where(eq(persons.id, created.value.id));
      expect(row?.deletedAt).not.toBeNull();

      const list = await listPeople(db, actor(owner.id, []), { offset: 0, limit: 50 }, signal);
      expect(list.rows.map((p) => p.id)).not.toContain(created.value.id);
    });
  });

  it("404s (CONTACT_NOT_FOUND) for a stranger who cannot see the person", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const created = await createPerson(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Private", emails: [], phones: [], orgId: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      const r = await deletePerson(db, actor(stranger.id, []), created.value.id, signal);
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_CONTACT_001");
    });
  });

  // Critical: contact.delete is a distinct, admin-configurable permission from contact.edit
  // (REGULAR_DEFAULT_FLAGS grants contact.edit_own but intentionally withholds every delete
  // flag). An owner who can see and edit their own record must NOT get delete for free.
  it("denies the owner from deleting their own visible person when they lack a delete flag", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const owner = await seedUser(db);
      const created = await createPerson(
        db,
        actor(owner.id, ["contact.create"]),
        { name: "Target", emails: [], phones: [], orgId: null, customFields: {} },
        signal,
      );
      if (created.ok === false) throw new Error(`setup: ${created.error.message}`);

      // Owner can see (owns) and can edit (edit_own), but was never granted a delete flag.
      const r = await deletePerson(
        db,
        actor(owner.id, ["contact.edit_own"]),
        created.value.id,
        signal,
      );
      expect(r.ok).toBe(false);
      if (r.ok === true) return;
      expect(r.error.id).toBe("E_PERM_001");

      const [row] = await db.select().from(persons).where(eq(persons.id, created.value.id));
      expect(row?.deletedAt).toBeNull();
    });
  });
});
