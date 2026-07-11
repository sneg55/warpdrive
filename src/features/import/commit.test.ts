import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, leads, notes, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createPerson } from "@/features/contacts/personsRepo";
import { personCreateInput } from "@/features/contacts/schemas";
import { commitRow, type ImportActor } from "./commit";

function actorFor(id: string): ImportActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    // A real regular importer has contact.create (REGULAR_DEFAULT_FLAGS grants it); applyCreate
    // now enforces it, so the create-path tests need it.
    flags: new Set(["contact.create"]),
  };
}

// Admin actor: can(contact.edit) passes via admin bypass, keeping the update-mode
// test focused on the update mechanics rather than permission-flag plumbing.
function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

async function seedValidRow(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  mapped: Record<string, unknown>,
): Promise<{ id: string }> {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: "person", filename: "p.csv", createdBy: userId })
    .returning();
  if (batch === undefined) throw new Error("batch seed failed");
  const [row] = await db
    .insert(importRows)
    .values({
      batchId: batch.id,
      rowNumber: 1,
      raw: {},
      mapped: { primary: mapped },
      status: "valid",
    })
    .returning();
  if (row === undefined) throw new Error("row seed failed");
  return row;
}

it("denies a create when the actor lacks contact.create", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    // Regular actor WITHOUT contact.create: a data.import user must not create contacts.
    const actor: ImportActor = {
      id: user.id,
      type: "regular",
      isActive: true,
      groupIds: new Set<string>(),
      primaryVisibilityGroupId: null,
      flags: new Set(),
    };
    const row = await seedValidRow(db, user.id, {
      name: "Blocked Jane",
      emails: [],
      phones: [],
      orgId: null,
      customFields: {},
    });
    const r = await commitRow(db, actor, row.id, "person", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");
    expect(await db.select().from(persons).where(eq(persons.name, "Blocked Jane"))).toHaveLength(0);
  });
});

it("creates an entity for a zero-candidate row and is idempotent on retry", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      name: "Imported Jane",
      emails: [{ label: "work", value: "imp@a.com", primary: true }],
      phones: [],
      orgId: null,
      customFields: {},
    });

    const first = await commitRow(db, actor, row.id, "person", "skip", signal);
    expect(first.ok).toBe(true);
    if (first.ok === true) expect(first.value.status).toBe("imported");

    // retry: row is already imported -> idempotent no-op, no second person created.
    const second = await commitRow(db, actor, row.id, "person", "skip", signal);
    expect(second.ok).toBe(true);

    const created = await db.select().from(persons).where(eq(persons.primaryEmail, "imp@a.com"));
    expect(created).toHaveLength(1); // no duplicate from retry
  });
});

it("marks a one-candidate row skipped_duplicate in skip mode", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);

    await db.insert(persons).values({
      name: "Existing",
      primaryEmail: "dupe@a.com",
      ownerId: user.id,
      visibilityLevel: "all",
    });

    const row = await seedValidRow(db, user.id, {
      name: "Dupe",
      emails: [{ label: "work", value: "dupe@a.com", primary: true }],
      phones: [],
      orgId: null,
      customFields: {},
    });

    const r = await commitRow(db, actor, row.id, "person", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("skipped_duplicate");
  });
});

it("marks an ambiguous row invalid", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);

    await db
      .insert(persons)
      .values({ name: "A", primaryEmail: "amb2@a.com", ownerId: user.id, visibilityLevel: "all" });
    await db
      .insert(persons)
      .values({ name: "B", primaryEmail: "amb2@a.com", ownerId: user.id, visibilityLevel: "all" });

    const row = await seedValidRow(db, user.id, {
      name: "C",
      emails: [{ label: "work", value: "amb2@a.com", primary: true }],
      phones: [],
      orgId: null,
      customFields: {},
    });

    const r = await commitRow(db, actor, row.id, "person", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");
  });
});

it("updates an existing candidate in update mode (no duplicate created)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    // Existing person owned by the actor, visible+editable.
    const [existing] = await db
      .insert(persons)
      .values({
        name: "Old Name",
        primaryEmail: "upd@a.com",
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (existing === undefined) throw new Error("existing seed failed");

    const row = await seedValidRow(db, user.id, {
      name: "New Name",
      emails: [{ label: "work", value: "upd@a.com", primary: true }],
      phones: [],
      orgId: null,
      customFields: {},
    });

    const r = await commitRow(db, actor, row.id, "person", "update", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.status).toBe("imported");
      // createdEntityId is null for an update: this row edited a pre-existing record, it did
      // not create one. Undo relies on this so it never soft-deletes an updated record.
      expect(r.value.entityId).toBeNull();
    }

    // The existing record was updated in place, not duplicated.
    const matches = await db.select().from(persons).where(eq(persons.primaryEmail, "upd@a.com"));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(existing.id);
    expect(matches[0]?.name).toBe("New Name");
  });
});

// Batches validated BEFORE cross-entity mapping shipped hold a flat mapped row in
// import_rows.mapped ({ name: "..." }), not { primary: { name: "..." } }. They are already in
// "valid" state, so nothing revalidates them: commitRow has to read them as they are, or a ready
// batch sitting in prod fails on deploy instead of importing.
it("commits a legacy row whose mapped JSON is flat, not grouped", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "person", filename: "p.csv", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        // The pre-upgrade shape, written by the old validate step.
        mapped: { name: "Legacy Person", customFields: {} } as never,
        status: "valid",
      })
      .returning();

    const r = await commitRow(db, actor, row!.id, "person", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("imported");

    const found = await db.select().from(persons).where(eq(persons.name, "Legacy Person"));
    expect(found).toHaveLength(1);
  });
});

// The legacy lead shape carried its organization as a flat "orgName" cell.
it("commits a legacy lead row, linking the org from its flat orgName cell", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

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
        mapped: { title: "Legacy lead", orgName: "Legacy Transit" } as never,
        status: "valid",
      })
      .returning();

    const r = await commitRow(db, actor, row!.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    if (r.ok) expect(r.value.status).toBe("imported");
    const [lead] = await db.select().from(leads).where(eq(leads.title, "Legacy lead"));
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Legacy Transit"));
    expect(lead).toBeDefined();
    expect(org).toBeDefined();
    expect(lead?.orgId).toBe(org?.id);
  });
});

// A person row that matches an existing contact by email still describes that person's
// organization and note. The update path must resolve them too, or "update" mode silently drops
// every related record the row carried.
it("links the organization and writes the note when updating a duplicate person", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const existing = await createPerson(
      db,
      actor,
      personCreateInput.parse({
        name: "Jane Doe",
        emails: [{ label: "work", value: "jane@a.com", primary: true }],
      }),
      signal,
    );
    if (existing.ok === false) throw new Error("person seed failed");

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "person", filename: "p.csv", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: {
          primary: {
            name: "Jane Doe",
            emails: [{ label: "work", value: "jane@a.com", primary: true }],
            customFields: {},
          },
          organization: { name: "Dup Transit", domain: "dup.example" },
          note: { body: "posture: fails" },
        },
        status: "valid",
      })
      .returning();

    const r = await commitRow(db, actor, row!.id, "person", "update", signal);
    expect(r.ok).toBe(true);

    const [person] = await db.select().from(persons).where(eq(persons.id, existing.value.id));
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Dup Transit"));
    expect(org).toBeDefined();
    expect(person?.orgId).toBe(org?.id);

    const rowNotes = await db.select().from(notes).where(eq(notes.entityId, existing.value.id));
    expect(rowNotes).toHaveLength(1);
  });
});
