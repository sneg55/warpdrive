import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, leads, notes, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createOrg } from "@/features/contacts/orgsRepo";
import { createPerson } from "@/features/contacts/personsRepo";
import { orgCreateInput, personCreateInput } from "@/features/contacts/schemas";
import { commitRow, type ImportActor } from "./commit";
import { handleUndoJob, undoBatch } from "./undoJob";

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

it("no-ops on an already-undone batch and preserves undoneAt (stale retry)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const when = new Date("2026-07-01T00:00:00Z");
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "undone",
        undoneAt: when,
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values({
      batchId: b!.id,
      rowNumber: 1,
      raw: { Name: "X" },
      status: "imported",
      createdEntityId: null,
    });

    await handleUndoJob(db, { data: { batchId: b!.id } }, AbortSignal.timeout(5000));

    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, b!.id));
    expect(after?.status).toBe("undone");
    // undoneAt is preserved, not clobbered to null by the stale retry.
    expect(after?.undoneAt?.toISOString()).toBe(when.toISOString());
  });
});

it("does NOT delete a pre-existing record that update-mode only edited (null createdEntityId)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    // preexisting = a record that existed before the import; an update-mode row edited it, so
    // its import row carries a null createdEntityId. created = a record the import created.
    const [preexisting] = await db
      .insert(persons)
      .values({ name: "Preexisting", ownerId: user.id, visibilityLevel: "owner" })
      .returning();
    const [created] = await db
      .insert(persons)
      .values({ name: "Created", ownerId: user.id, visibilityLevel: "owner" })
      .returning();
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "completed",
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values([
      {
        batchId: b!.id,
        rowNumber: 1,
        raw: { Name: "Created" },
        status: "imported",
        createdEntityId: created!.id,
      },
      {
        batchId: b!.id,
        rowNumber: 2,
        raw: { Name: "Preexisting" },
        status: "imported",
        createdEntityId: null,
      },
    ]);

    await handleUndoJob(db, { data: { batchId: b!.id } }, AbortSignal.timeout(5000));

    const [c] = await db.select().from(persons).where(eq(persons.id, created!.id));
    const [p] = await db.select().from(persons).where(eq(persons.id, preexisting!.id));
    expect(c?.deletedAt).not.toBeNull(); // created record removed
    expect(p?.deletedAt).toBeNull(); // pre-existing record untouched
  });
});

it("soft-deletes only the records the batch created", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const [created] = await db
      .insert(persons)
      .values({ name: "Imported", ownerId: user.id, visibilityLevel: "owner" })
      .returning();
    const [b] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "c.csv",
        status: "completed",
        importedRows: 1,
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values({
      batchId: b!.id,
      rowNumber: 1,
      raw: { Name: "Imported" },
      status: "imported",
      createdEntityId: created!.id,
    });

    await handleUndoJob(db, { data: { batchId: b!.id } }, AbortSignal.timeout(5000));

    const [p] = await db.select().from(persons).where(eq(persons.id, created!.id));
    expect(p?.deletedAt).not.toBeNull();
    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, b!.id));
    expect(after?.status).toBe("undone");
    expect(after?.undoneAt).not.toBeNull();
  });
});

it("removes an organization the lead import created as a side effect, on undo", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

    // Commit a lead row that find-or-creates a brand-new org while linking.
    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "lead", filename: "l.csv", status: "completed", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: {
          primary: { title: "http://www.septa.org/" },
          organization: { name: "Undo Transit Authority" },
        },
        status: "valid",
      })
      .returning();
    await commitRow(db, actor, row!.id, "lead", "skip", signal);

    const [orgBefore] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Undo Transit Authority"));
    expect(orgBefore?.deletedAt).toBeNull();
    const [leadBefore] = await db
      .select()
      .from(leads)
      .where(eq(leads.title, "http://www.septa.org/"));
    expect(leadBefore?.orgId).toBe(orgBefore?.id);

    await handleUndoJob(db, { data: { batchId: batch!.id } }, signal);

    // Both the lead AND the org it created are removed: no orphan org left behind.
    const [orgAfter] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Undo Transit Authority"));
    expect(orgAfter?.deletedAt).not.toBeNull();
    const [batchAfter] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batch!.id));
    expect(batchAfter?.status).toBe("undone");
  });
});

// A row note is created by the import, so undo must remove it too. A note left pointing at a
// soft-deleted lead is exactly the debris createdNoteId exists to prevent.
it("removes the note a lead import created, on undo", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "lead", filename: "l.csv", status: "completed", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: {
          primary: { title: "Noted undo lead" },
          note: { body: "posture: fails-validation" },
        },
        status: "valid",
      })
      .returning();
    await commitRow(db, actor, row!.id, "lead", "skip", signal);

    const [noteBefore] = await db
      .select()
      .from(notes)
      .where(eq(notes.body, "posture: fails-validation"));
    expect(noteBefore?.deletedAt).toBeNull();

    await handleUndoJob(db, { data: { batchId: batch!.id } }, signal);

    const [noteAfter] = await db
      .select()
      .from(notes)
      .where(eq(notes.body, "posture: fails-validation"));
    expect(noteAfter?.deletedAt).not.toBeNull();

    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(after?.status).toBe("undone");
  });
});

// The counterpart to the created-org test: an org the row merely LINKED to predates the import
// and must survive undo, along with any enrichment written onto it.
it("leaves a pre-existing organization and its enrichment alone, on undo", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

    const seededRes = await createOrg(
      db,
      actor,
      orgCreateInput.parse({ name: "Preexisting Transit" }),
      signal,
    );
    if (seededRes.ok === false) throw new Error("org seed failed");
    const seeded = seededRes.value;

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "lead", filename: "l.csv", status: "completed", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: {
          primary: { title: "Linked lead" },
          organization: { name: "Preexisting Transit", domain: "preexisting.example" },
        },
        status: "valid",
      })
      .returning();
    await commitRow(db, actor, row!.id, "lead", "skip", signal);

    // The row linked rather than created, so nothing is tracked for undo.
    const [committed] = await db.select().from(importRows).where(eq(importRows.id, row!.id));
    expect(committed?.createdOrgId).toBeNull();

    await handleUndoJob(db, { data: { batchId: batch!.id } }, signal);

    const [orgAfter] = await db.select().from(organizations).where(eq(organizations.id, seeded.id));
    expect(orgAfter?.deletedAt).toBeNull();
    // Enrichment is not reverted: undo removes what the import created, not what it edited.
    expect(orgAfter?.domain).toBe("preexisting.example");
  });
});

// Undo walks rows outside one transaction. If the actor cannot delete the primary record, its note
// must survive: removing the note off a still-live imported lead would be data loss with nothing
// undone in exchange.
it("keeps the row note when the primary record cannot be deleted", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const admin = await seedUser(db, { isAdmin: true });
    const adminActor = adminActorFor(admin.id);

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "lead", filename: "l.csv", status: "completed", createdBy: admin.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: { primary: { title: "Protected lead" }, note: { body: "keep me" } },
        status: "valid",
      })
      .returning();
    await commitRow(db, adminActor, row!.id, "lead", "skip", signal);

    // A different regular user, owning nothing and holding no flags, cannot remove the lead.
    const other = await seedUser(db, { email: "other@example.com" });
    const powerless: ImportActor = {
      id: other.id,
      type: "regular",
      isActive: true,
      groupIds: new Set<string>(),
      primaryVisibilityGroupId: null,
      flags: new Set(),
    };
    await undoBatch(db, powerless, batch!.id, signal);

    const [lead] = await db.select().from(leads).where(eq(leads.title, "Protected lead"));
    expect(lead?.deletedAt).toBeNull();
    const [note] = await db.select().from(notes).where(eq(notes.body, "keep me"));
    expect(note?.deletedAt).toBeNull();

    // Nothing was undone, so the batch keeps its prior terminal status and Undo stays available.
    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(after?.status).toBe("completed");
  });
});

// An "update"-mode row finalizes with a null createdEntityId (it edited a pre-existing contact,
// which undo must never delete) but it may still have CREATED an org and a note. Those are the
// import's own debris and undo has to remove them, even though there is no primary to delete.
it("removes the org and note an update-mode row created, though it deletes no primary", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
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
      .values({
        targetEntity: "person",
        filename: "p.csv",
        status: "completed",
        createdBy: user.id,
      })
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
          organization: { name: "Update Transit" },
          note: { body: "created by an update row" },
        },
        status: "valid",
      })
      .returning();
    await commitRow(db, actor, row!.id, "person", "update", signal);

    const [committed] = await db.select().from(importRows).where(eq(importRows.id, row!.id));
    expect(committed?.createdEntityId).toBeNull();
    expect(committed?.createdOrgId).not.toBeNull();
    expect(committed?.createdNoteId).not.toBeNull();

    await undoBatch(db, actor, batch!.id, signal);

    // The pre-existing person survives; the org and note this import created do not.
    const [person] = await db.select().from(persons).where(eq(persons.id, existing.value.id));
    expect(person?.deletedAt).toBeNull();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Update Transit"));
    expect(org?.deletedAt).not.toBeNull();
    const [note] = await db.select().from(notes).where(eq(notes.body, "created by an update row"));
    expect(note?.deletedAt).not.toBeNull();
  });
});

// A retry after a crash mid-undo: the primary is already soft-deleted, so its delete authority
// reports failure. The remaining side effects must still be cleaned rather than stranded forever.
it("cleans side effects on a retry whose primary was already deleted", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

    const [batch] = await db
      .insert(importBatches)
      .values({ targetEntity: "lead", filename: "l.csv", status: "completed", createdBy: user.id })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: {
          primary: { title: "Crashed lead" },
          organization: { name: "Crashed Transit" },
          note: { body: "orphan candidate" },
        },
        status: "valid",
      })
      .returning();
    await commitRow(db, actor, row!.id, "lead", "skip", signal);

    // Simulate the crash: the primary was deleted, nothing else was.
    const [lead] = await db.select().from(leads).where(eq(leads.title, "Crashed lead"));
    await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, lead!.id));

    await undoBatch(db, actor, batch!.id, signal);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Crashed Transit"));
    expect(org?.deletedAt).not.toBeNull();
    const [note] = await db.select().from(notes).where(eq(notes.body, "orphan candidate"));
    expect(note?.deletedAt).not.toBeNull();
  });
});

// An update-mode person row can match an existing contact AND create a new org for it, linking the
// live person to that org. Undo deletes the created org; the person survives, so its orgId would
// point at a soft-deleted org unless undo also clears the reference.
it("clears a live person's link to an organization undo deletes", async () => {
  await withTestDb(async (db) => {
    const signal = AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

    const existing = await createPerson(
      db,
      actor,
      personCreateInput.parse({
        name: "Linked Jane",
        emails: [{ label: "work", value: "linked@a.com", primary: true }],
      }),
      signal,
    );
    if (existing.ok === false) throw new Error("person seed failed");

    const [batch] = await db
      .insert(importBatches)
      .values({
        targetEntity: "person",
        filename: "p.csv",
        status: "completed",
        createdBy: user.id,
      })
      .returning();
    const [row] = await db
      .insert(importRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        raw: {},
        mapped: {
          primary: {
            name: "Linked Jane",
            emails: [{ label: "work", value: "linked@a.com", primary: true }],
            customFields: {},
          },
          organization: { name: "Dangling Transit" },
        },
        status: "valid",
      })
      .returning();
    await commitRow(db, actor, row!.id, "person", "update", signal);

    const [linked] = await db.select().from(persons).where(eq(persons.id, existing.value.id));
    expect(linked?.orgId).not.toBeNull();

    await undoBatch(db, actor, batch!.id, signal);

    // The org is gone and the person no longer points at it.
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Dangling Transit"));
    expect(org?.deletedAt).not.toBeNull();
    const [after] = await db.select().from(persons).where(eq(persons.id, existing.value.id));
    expect(after?.deletedAt).toBeNull();
    expect(after?.orgId).toBeNull();
  });
});
