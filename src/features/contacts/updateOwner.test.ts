import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { ContactActor } from "./personsRepo";
import { updatePerson } from "./personsRepo";

function actor(
  id: string,
  opts: { admin?: boolean; flags?: PermissionFlagKey[] } = {},
): ContactActor {
  return {
    id,
    type: opts.admin === true ? "admin" : "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(opts.flags ?? []),
    primaryVisibilityGroupId: null,
  };
}

it("persists person labels through updatePerson and leaves them untouched when omitted (spec B5)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db, { name: "Owner" });
    const [person] = await db
      .insert(persons)
      .values({ name: "Ada", ownerId: owner.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    // Set labels.
    const r1 = await updatePerson(
      db,
      actor(owner.id, { flags: ["contact.edit_any"] }),
      { id: person.id, labels: ["hot", "warm"] },
      signal,
    );
    expect(r1.ok).toBe(true);
    const [afterSet] = await db.select().from(persons).where(eq(persons.id, person.id));
    expect(afterSet?.labels).toEqual(["hot", "warm"]);

    // A later edit that omits labels must NOT wipe them.
    const r2 = await updatePerson(
      db,
      actor(owner.id, { flags: ["contact.edit_any"] }),
      { id: person.id, name: "Ada Lovelace" },
      signal,
    );
    expect(r2.ok).toBe(true);
    const [afterEdit] = await db.select().from(persons).where(eq(persons.id, person.id));
    expect(afterEdit?.labels).toEqual(["hot", "warm"]);
    expect(afterEdit?.name).toBe("Ada Lovelace");
  });
});

it("lets a deal.changeOwner holder transfer a person to another user", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db, { name: "Owner" });
    const target = await seedUser(db, { name: "Target" });
    const [person] = await db
      .insert(persons)
      .values({ name: "Ada", ownerId: owner.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    const r = await updatePerson(
      db,
      actor(owner.id, { flags: ["contact.edit_any", "deal.changeOwner_any"] }),
      { id: person.id, ownerId: target.id },
      signal,
    );
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(persons).where(eq(persons.id, person.id));
    expect(row?.ownerId).toBe(target.id);
  });
});

it("ignores an ownerId change from an actor without deal.changeOwner (no privilege escalation)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db, { name: "Owner" });
    const target = await seedUser(db, { name: "Target" });
    const [person] = await db
      .insert(persons)
      .values({ name: "Ada", ownerId: owner.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    // contact.edit_any lets the edit through, but without deal.changeOwner the owner override is dropped.
    const r = await updatePerson(
      db,
      actor(target.id, { flags: ["contact.edit_any"] }),
      { id: person.id, name: "Ada Lovelace", ownerId: target.id },
      signal,
    );
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(persons).where(eq(persons.id, person.id));
    expect(row?.name).toBe("Ada Lovelace"); // the edit applied
    expect(row?.ownerId).toBe(owner.id); // ...but the owner did NOT change
  });
});

it("rejects an owner transfer to an inactive user and keeps the current owner (codex P2)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db, { name: "Owner" });
    const inactive = await seedUser(db, { name: "Disabled", isActive: false });
    const [person] = await db
      .insert(persons)
      .values({ name: "Ada", ownerId: owner.id, visibilityLevel: "all" })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    const r = await updatePerson(
      db,
      actor(owner.id, { flags: ["contact.edit_any", "deal.changeOwner_any"] }),
      { id: person.id, ownerId: inactive.id },
      signal,
    );
    expect(r.ok).toBe(false);
    const [row] = await db.select().from(persons).where(eq(persons.id, person.id));
    expect(row?.ownerId).toBe(owner.id);
  });
});

it("owner transfer preserves existing emails and custom fields (codex P1: no default clobber)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db, { name: "Owner" });
    const target = await seedUser(db, { name: "Target" });
    const [person] = await db
      .insert(persons)
      .values({
        name: "Ada",
        ownerId: owner.id,
        visibilityLevel: "all",
        emails: [{ label: "work", value: "ada@example.com", primary: true }],
        phones: [{ label: "mobile", value: "+1 555 0100", primary: true }],
      })
      .returning();
    if (person === undefined) throw new Error("person seed failed");

    const r = await updatePerson(
      db,
      actor(owner.id, { flags: ["contact.edit_any", "deal.changeOwner_any"] }),
      { id: person.id, ownerId: target.id },
      signal,
    );
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(persons).where(eq(persons.id, person.id));
    expect(row?.ownerId).toBe(target.id);
    // The owner-only update must NOT reset the contact's other fields to schema defaults.
    expect(row?.emails).toHaveLength(1);
    expect(row?.phones).toHaveLength(1);
  });
});
