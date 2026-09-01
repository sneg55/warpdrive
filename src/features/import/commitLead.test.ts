import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importRows, leads, notes } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { commitRow } from "./commit";
import { adminActorFor, seedValidRow } from "./commitLead.testHelpers";

it("creates a lead (no pipeline/stage, no dedup key)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "A promising lead", value: 500 },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db.select().from(leads).where(eq(leads.title, "A promising lead"));
    expect(created).toHaveLength(1);
    expect(created[0]?.ownerId).toBe(user.id);
  });
});

it("re-running commitRow on an already-imported lead row is an idempotent no-op", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { primary: { title: "Retry lead" } });
    await commitRow(db, actor, row.id, "lead", "skip", signal);
    const second = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(second.ok).toBe(true);

    const created = await db.select().from(leads).where(eq(leads.title, "Retry lead"));
    expect(created).toHaveLength(1);
  });
});

it("creates a lead with no org link when the Organization column is unmapped/blank", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { primary: { title: "Standalone lead" } });
    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [created] = await db.select().from(leads).where(eq(leads.title, "Standalone lead"));
    expect(created?.orgId).toBeNull();
  });
});

it("reports a lead row missing the required title as invalid (not silently dropped)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { primary: { value: 500 } });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");
  });
});

it("creates a note on the lead and records it for undo", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      primary: { title: "Noted lead" },
      note: { body: "posture: fails-validation\nmatch_confidence: high" },
    });

    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.title, "Noted lead"));
    const rowNotes = await db.select().from(notes).where(eq(notes.entityId, lead!.id));
    expect(rowNotes).toHaveLength(1);
    expect(rowNotes[0]?.entityType).toBe("lead");
    expect(rowNotes[0]?.body).toBe("posture: fails-validation\nmatch_confidence: high");

    const [persisted] = await db.select().from(importRows).where(eq(importRows.id, row.id));
    expect(persisted?.createdNoteId).toBe(rowNotes[0]?.id);
  });
});

it("persists mapped lead custom fields", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const def = await createDef(db, { targetEntity: "lead", type: "text", name: "Grade" }, signal);
    if (!def.ok) throw new Error("def seed failed");

    const row = await seedValidRow(db, user.id, {
      primary: { title: "Graded lead", customFields: { grade: "A" } },
    });
    const r = await commitRow(db, actor, row.id, "lead", "skip", signal);
    expect(r.ok).toBe(true);

    const [created] = await db.select().from(leads).where(eq(leads.title, "Graded lead"));
    expect(created?.customFields).toEqual({ grade: "A" });
  });
});
