import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import type { Person } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { type ContactActor, createPerson, updatePerson } from "./personsRepo";

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

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

// Creates a person via the real repo function (not a raw insert) so ownerId/visibilityLevel
// and every other NOT NULL column are derived the same way production create traffic derives
// them, matching the pattern in deletePerson.test.ts / contactEditAuthz.test.ts.
async function createPersonFixture(db: Db, overrides: { name: string }): Promise<Person> {
  const owner = await seedUser(db);
  const created = await createPerson(
    db,
    actor(owner.id, ["contact.create"]),
    { name: overrides.name, emails: [], phones: [], orgId: null, customFields: {} },
    SIG(),
  );
  if (created.ok === false) throw new Error(`setup: ${created.error.message}`);
  return created.value;
}

describe("updatePerson: name recomputed from first/last", () => {
  // Setting firstName/lastName recomputes name; name still drives search.
  it("recomputes name when first/last are edited", async () => {
    await withTestDb(async (db) => {
      const p = await createPersonFixture(db, { name: "Old Name" });
      const r = await updatePerson(
        db,
        actor(p.ownerId, ["contact.edit_own"]),
        { id: p.id, firstName: "Mia", lastName: "Silva" },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.firstName).toBe("Mia");
        expect(r.value.lastName).toBe("Silva");
        expect(r.value.name).toBe("Mia Silva");
      }
    });
  });

  it("drops last name and recomputes a single-word name when lastName is cleared", async () => {
    await withTestDb(async (db) => {
      const p = await createPersonFixture(db, { name: "Old Name" });
      const r = await updatePerson(
        db,
        actor(p.ownerId, ["contact.edit_own"]),
        { id: p.id, firstName: "Cher", lastName: null },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.firstName).toBe("Cher");
        expect(r.value.lastName).toBeNull();
        expect(r.value.name).toBe("Cher");
      }
    });
  });

  it("leaves name/first/last untouched when neither firstName nor lastName is in the input", async () => {
    await withTestDb(async (db) => {
      const p = await createPersonFixture(db, { name: "Old Name" });
      // createPerson (Finding 1 fix) derives firstName/lastName from the combined name, so a
      // freshly created "Old Name" person already has firstName/lastName set (not null).
      const r = await updatePerson(
        db,
        actor(p.ownerId, ["contact.edit_own"]),
        { id: p.id, orgId: null },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.name).toBe("Old Name");
        expect(r.value.firstName).toBe("Old");
        expect(r.value.lastName).toBe("Name");
      }
    });
  });
});

describe("createPerson: derives first/last from the combined name", () => {
  // Root cause of the data-loss bug (Finding 1): createPerson never set firstName/lastName,
  // so post-migration persons had NULL first/last, and a later lastName-only edit would
  // recompute `name` from an empty firstName and overwrite the whole thing.
  it("splits the combined name into firstName/lastName on create", async () => {
    await withTestDb(async (db) => {
      const p = await createPersonFixture(db, { name: "Mia Silva" });
      expect(p.firstName).toBe("Mia");
      expect(p.lastName).toBe("Silva");
      expect(p.name).toBe("Mia Silva");
    });
  });
});

describe("updatePerson: a direct name edit keeps first/last in sync", () => {
  // Patching only `name` (no firstName/lastName in the input) is what EditContactModal and
  // PersonSummaryEditPanel's Name row send. Without re-deriving, firstName/lastName would go
  // stale relative to the new name.
  it("re-derives first/last when only `name` is patched", async () => {
    await withTestDb(async (db) => {
      const p = await createPersonFixture(db, { name: "Old Name" });
      const r = await updatePerson(
        db,
        actor(p.ownerId, ["contact.edit_own"]),
        { id: p.id, name: "Ann Lee" },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.name).toBe("Ann Lee");
        expect(r.value.firstName).toBe("Ann");
        expect(r.value.lastName).toBe("Lee");
      }
    });
  });

  it("regression: a person created from a combined name keeps firstName when only lastName is edited", async () => {
    await withTestDb(async (db) => {
      const p = await createPersonFixture(db, { name: "Mia Silva" });
      // Sanity: createPerson must have derived first/last from the combined name, otherwise
      // this test would pass for the wrong reason.
      expect(p.firstName).toBe("Mia");
      expect(p.lastName).toBe("Silva");

      const r = await updatePerson(
        db,
        actor(p.ownerId, ["contact.edit_own"]),
        { id: p.id, lastName: "Jones" },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.firstName).toBe("Mia");
        expect(r.value.lastName).toBe("Jones");
        // Before the fix: firstName was NULL, so this recomputed to just "Jones".
        expect(r.value.name).toBe("Mia Jones");
      }
    });
  });
});
