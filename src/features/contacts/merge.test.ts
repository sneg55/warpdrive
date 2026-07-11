import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { mergePersons } from "./merge";
import { adminActor, regularActor } from "./mergeTestActors";
import { createPerson } from "./personsRepo";

it("repoints activities and soft-deletes the merged person", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActor(user.id);

    const survivor = await createPerson(
      db,
      actor,
      {
        name: "Jane Roe",
        emails: [{ label: "work", value: "jane@a.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );
    const dup = await createPerson(
      db,
      actor,
      {
        name: "J. Roe",
        emails: [{ label: "work", value: "jroe@a.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );
    if (survivor.ok === false || dup.ok === false) throw new Error("setup failed");

    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (type === undefined) throw new Error("activity type 'call' not seeded");
    await db.insert(activities).values({
      typeId: type.id,
      subject: "Call dup",
      ownerId: user.id,
      assigneeId: user.id,
      personId: dup.value.id,
    });

    const r = await mergePersons(
      db,
      actor,
      { survivorId: survivor.value.id, mergedId: dup.value.id, fieldChoices: { name: "Jane Roe" } },
      signal,
    );
    expect(r.ok).toBe(true);

    const moved = await db
      .select()
      .from(activities)
      .where(eq(activities.personId, survivor.value.id));
    expect(moved).toHaveLength(1);
    const [merged] = await db.select().from(persons).where(eq(persons.id, dup.value.id));
    expect(merged?.deletedAt).not.toBeNull();
  });
});

it("rejects merging a record into itself", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActor(user.id);

    const p = await createPerson(
      db,
      actor,
      { name: "Solo", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    if (p.ok === false) throw new Error("setup failed");

    const r = await mergePersons(
      db,
      actor,
      { survivorId: p.value.id, mergedId: p.value.id, fieldChoices: {} },
      signal,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_CONTACT_004");
  });
});

it("FIX 1: strips injected non-allowlisted fields from fieldChoices", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActor(user.id);

    const survivor = await createPerson(
      db,
      actor,
      { name: "A", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    const dup = await createPerson(
      db,
      actor,
      { name: "B", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    if (survivor.ok === false || dup.ok === false) throw new Error("setup failed");
    const originalOwner = survivor.value.ownerId;

    const r = await mergePersons(
      db,
      actor,
      {
        survivorId: survivor.value.id,
        mergedId: dup.value.id,
        // Inject privilege-escalation / corruption fields: must be stripped.
        fieldChoices: {
          name: "X",
          ownerId: "00000000-0000-0000-0000-000000000000",
          visibilityLevel: "all",
          deletedAt: null,
        },
      },
      signal,
    );
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.ownerId).toBe(originalOwner);
      expect(r.value.name).toBe("X");
      expect(r.value.deletedAt).toBeNull();
    }
  });
});

it("FIX 2: returns 404 (E_CONTACT_001) for a record the actor cannot see", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const ownerActor = adminActor(owner.id);
    const other = await seedUser(db);
    const otherActor = regularActor(other.id);

    // owner-visibility persons owned by `owner`, invisible to `other`.
    const survivor = await createPerson(
      db,
      ownerActor,
      { name: "Hidden A", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    const dup = await createPerson(
      db,
      ownerActor,
      { name: "Hidden B", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    if (survivor.ok === false || dup.ok === false) throw new Error("setup failed");

    const r = await mergePersons(
      db,
      otherActor,
      { survivorId: survivor.value.id, mergedId: dup.value.id, fieldChoices: {} },
      signal,
    );
    expect(r.ok).toBe(false);
    // 404-on-invisible, NOT 403.
    if (r.ok === false) expect(r.error.id).toBe("E_CONTACT_001");
  });
});
