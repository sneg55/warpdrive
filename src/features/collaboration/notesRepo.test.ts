import { expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { createNote, listNotes, softDeleteNote, togglePin, updateNote } from "./notesRepo";

function actorFor(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

async function seedDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
  visibilityLevel: "owner" | "all",
): Promise<{ id: string }> {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const stage = pipe.stages[0];
  if (stage === undefined) throw new Error("stage seed failed");
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: stage.id,
      ownerId,
      visibilityLevel,
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  return deal;
}

it("creates notes and lists pinned first", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);
    const deal = await seedDeal(db, user.id, "all");

    const a = await createNote(
      db,
      actor,
      { entityType: "deal", entityId: deal.id, body: "first", pinned: false },
      signal,
    );
    const b = await createNote(
      db,
      actor,
      { entityType: "deal", entityId: deal.id, body: "second", pinned: false },
      signal,
    );
    if (a.ok === false || b.ok === false) throw new Error("setup failed");

    const pinResult = await togglePin(db, actor, b.value.id, true, signal);
    expect(pinResult.ok).toBe(true);

    const list = await listNotes(db, "deal", deal.id, signal);
    expect(list[0]?.body).toBe("second");
    expect(list[0]?.pinned).toBe(true);
  });
});

it("resolves the note author's display name (actorName) via the users join", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const author = await seedUser(db, { name: "Ada Lovelace" });
    const actor = actorFor(author.id);
    const deal = await seedDeal(db, author.id, "all");

    const created = await createNote(
      db,
      actor,
      { entityType: "deal", entityId: deal.id, body: "authored", pinned: false },
      signal,
    );
    if (created.ok === false) throw new Error("setup failed");

    const list = await listNotes(db, "deal", deal.id, signal);
    // Attribution: the note row must carry the author's display name, mirroring the
    // changelog's users-join (so AttributionLine can render "Ada Lovelace").
    expect(list[0]?.actorName).toBe("Ada Lovelace");
  });
});

it("rejects a note whose parent the actor cannot see (404-shape)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const actor = actorFor(other.id);
    const hidden = await seedDeal(db, owner.id, "owner");

    const r = await createNote(
      db,
      actor,
      { entityType: "deal", entityId: hidden.id, body: "x", pinned: false },
      signal,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_DEAL_001");
  });
});

it("updates a note body", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);
    const deal = await seedDeal(db, user.id, "all");
    const created = await createNote(
      db,
      actor,
      { entityType: "deal", entityId: deal.id, body: "before", pinned: false },
      signal,
    );
    if (!created.ok) throw new Error("seed note failed");

    const res = await updateNote(db, actor, created.value.id, "after", signal);
    expect(res.ok).toBe(true);

    const listed = await listNotes(db, "deal", deal.id, signal);
    expect(listed[0]?.body).toBe("after");
  });
});

it("soft-deletes a note so it stops listing", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);
    const deal = await seedDeal(db, user.id, "all");
    const created = await createNote(
      db,
      actor,
      { entityType: "deal", entityId: deal.id, body: "doomed", pinned: false },
      signal,
    );
    if (!created.ok) throw new Error("seed note failed");

    const res = await softDeleteNote(db, actor, created.value.id, signal);
    expect(res.ok).toBe(true);

    const listed = await listNotes(db, "deal", deal.id, signal);
    expect(listed).toHaveLength(0);
  });
});

it("returns NOTE_NOT_FOUND updating a missing note", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);
    const res = await updateNote(db, actor, "00000000-0000-0000-0000-000000000000", "x", signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.id).toBe("E_NOTE_001");
  });
});

// Security branch: edit/delete are visibility-gated (assertReferenceVisible), so an actor
// who cannot see the note's parent deal must be denied with the reference-check's 404-shape
// error, and the note must be left untouched. Mirrors the createNote denial test above.
it("rejects updateNote when the actor cannot see the note's parent (404-shape)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const hidden = await seedDeal(db, owner.id, "owner");
    const created = await createNote(
      db,
      actorFor(owner.id),
      { entityType: "deal", entityId: hidden.id, body: "secret", pinned: false },
      signal,
    );
    if (!created.ok) throw new Error("seed note failed");

    const res = await updateNote(db, actorFor(other.id), created.value.id, "hacked", signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.id).toBe("E_DEAL_001");

    // Body unchanged: the denied write never landed.
    const listed = await listNotes(db, "deal", hidden.id, signal);
    expect(listed[0]?.body).toBe("secret");
  });
});

it("rejects softDeleteNote when the actor cannot see the note's parent (404-shape)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const hidden = await seedDeal(db, owner.id, "owner");
    const created = await createNote(
      db,
      actorFor(owner.id),
      { entityType: "deal", entityId: hidden.id, body: "keep", pinned: false },
      signal,
    );
    if (!created.ok) throw new Error("seed note failed");

    const res = await softDeleteNote(db, actorFor(other.id), created.value.id, signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.id).toBe("E_DEAL_001");

    // Note still lists: the denied delete never landed.
    const listed = await listNotes(db, "deal", hidden.id, signal);
    expect(listed).toHaveLength(1);
  });
});
