import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { type ContactActor, createPerson, getPerson } from "./personsRepo";

it("creates a person, derives owner+primary_email, and rejects bad custom fields", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    // Create a required custom-field def for persons.
    const defResult = await createDef(
      db,
      { targetEntity: "person", type: "text", name: "Seniority", isRequired: true },
      signal,
    );
    if (defResult.ok === false) throw new Error(`createDef failed: ${defResult.error.message}`);

    // Missing required custom field -> E_CF_003.
    const bad = await createPerson(
      db,
      meActor,
      {
        name: "Jane Roe",
        emails: [{ label: "work", value: "Jane@Acme.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.error.id).toBe("E_CF_003");

    // Valid custom fields -> ok.
    const good = await createPerson(
      db,
      meActor,
      {
        name: "Jane Roe",
        emails: [{ label: "work", value: "Jane@Acme.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: { seniority: "Director" },
      },
      signal,
    );
    expect(good.ok).toBe(true);
    if (good.ok === true) {
      expect(good.value.ownerId).toBe(me.id);
      expect(good.value.primaryEmail).toBe("jane@acme.com");
    }
  });
});

it("returns a 404-shape from getPerson for a person the actor cannot see", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;

    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    const other = await seedUser(db);
    const otherActor: ContactActor = {
      id: other.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    // Create a person owned by other (settings empty -> level = "owner").
    const hidden = await createPerson(
      db,
      otherActor,
      {
        name: "Secret",
        emails: [],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );
    if (hidden.ok === false) throw new Error(`setup failed: ${hidden.error.message}`);

    // meActor cannot see otherActor's owner-level person.
    const got = await getPerson(db, meActor, hidden.value.id, signal);
    expect(got.ok).toBe(false);
    if (got.ok === false) expect(got.error.id).toBe("E_CONTACT_001");
  });
});

it("getPerson resolves the owner's name via the users join (Wave 4, Task 5)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db, { name: "Ann Owner" });
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };

    const created = await createPerson(
      db,
      meActor,
      { name: "Jane Roe", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    if (created.ok === false) throw new Error(`setup failed: ${created.error.message}`);

    const got = await getPerson(db, meActor, created.value.id, signal);
    expect(got.ok).toBe(true);
    if (got.ok === true) expect(got.value.ownerName).toBe("Ann Owner");
  });
});

it("returns a 404-shape from getPerson for a non-uuid id instead of throwing (bad param -> 404)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const me = await seedUser(db);
    const meActor: ContactActor = {
      id: me.id,
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
      primaryVisibilityGroupId: null,
    };
    const got = await getPerson(db, meActor, "not-a-uuid", signal);
    expect(got.ok).toBe(false);
    if (got.ok === false) expect(got.error.id).toBe("E_CONTACT_001");
  });
});
