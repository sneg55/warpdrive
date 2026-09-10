import { expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { deals, leads } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { createComment, deleteComment, listCommentsForEntity, updateComment } from "./commentsRepo";
import { createNote, softDeleteNote } from "./notesRepo";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

function actorFor(id: string, type: "regular" | "admin" = "regular"): AuthUser {
  return { id, type, isActive: true, groupIds: new Set() };
}

async function seedDeal(db: TestDb, ownerId: string, visibilityLevel: "owner" | "all") {
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

async function seedNoteOnDeal(db: TestDb, actor: AuthUser, dealId: string, body = "parent note") {
  const note = await createNote(
    db,
    actor,
    { entityType: "deal", entityId: dealId, body, pinned: false },
    new AbortController().signal,
  );
  if (note.ok === false) throw new Error("note seed failed");
  return note.value;
}

it("lists a note's comments oldest first with the author display name", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const author = await seedUser(db, { name: "Ada Lovelace" });
    const replier = await seedUser(db, { name: "Grace Hopper" });
    const deal = await seedDeal(db, author.id, "all");
    const note = await seedNoteOnDeal(db, actorFor(author.id), deal.id);

    const first = await createComment(
      db,
      actorFor(author.id),
      { noteId: note.id, body: "mine" },
      signal,
    );
    const second = await createComment(
      db,
      actorFor(replier.id),
      { noteId: note.id, body: "theirs" },
      signal,
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const list = await listCommentsForEntity(db, actorFor(author.id), "deal", deal.id, signal);
    expect(list.map((c) => c.body)).toEqual(["mine", "theirs"]);
    expect(list[0]?.noteId).toBe(note.id);
    expect(list[1]?.actorName).toBe("Grace Hopper");
  });
});

it("rejects a comment on a lead note, matching Pipedrive", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = actorFor(user.id);
    const [lead] = await db
      .insert(leads)
      .values({ title: "L", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (lead === undefined) throw new Error("lead seed failed");
    const note = await createNote(
      db,
      actor,
      { entityType: "lead", entityId: lead.id, body: "lead note", pinned: false },
      signal,
    );
    if (note.ok === false) throw new Error("note seed failed");

    const result = await createComment(db, actor, { noteId: note.value.id, body: "nope" }, signal);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.id).toBe(ERROR_IDS.COMMENT_ENTITY_UNSUPPORTED);
    }
  });
});

it("denies a regular user editing or deleting someone else's comment", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const author = await seedUser(db);
    const other = await seedUser(db);
    const deal = await seedDeal(db, author.id, "all");
    const note = await seedNoteOnDeal(db, actorFor(author.id), deal.id);
    const created = await createComment(
      db,
      actorFor(author.id),
      { noteId: note.id, body: "mine" },
      signal,
    );
    if (created.ok === false) throw new Error("comment seed failed");

    const edit = await updateComment(db, actorFor(other.id), created.value.id, "hijacked", signal);
    expect(edit.ok).toBe(false);
    if (edit.ok === false) expect(edit.error.id).toBe(ERROR_IDS.COMMENT_FORBIDDEN);

    const removal = await deleteComment(db, actorFor(other.id), created.value.id, signal);
    expect(removal.ok).toBe(false);
    if (removal.ok === false) expect(removal.error.id).toBe(ERROR_IDS.COMMENT_FORBIDDEN);
  });
});

it("lets an admin edit and delete another user's comment", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const author = await seedUser(db);
    const admin = await seedUser(db);
    const deal = await seedDeal(db, author.id, "all");
    const note = await seedNoteOnDeal(db, actorFor(author.id), deal.id);
    const created = await createComment(
      db,
      actorFor(author.id),
      { noteId: note.id, body: "mine" },
      signal,
    );
    if (created.ok === false) throw new Error("comment seed failed");

    const edit = await updateComment(
      db,
      actorFor(admin.id, "admin"),
      created.value.id,
      "moderated",
      signal,
    );
    expect(edit.ok).toBe(true);

    const removal = await deleteComment(db, actorFor(admin.id, "admin"), created.value.id, signal);
    expect(removal.ok).toBe(true);

    const list = await listCommentsForEntity(db, actorFor(author.id), "deal", deal.id, signal);
    expect(list).toHaveLength(0);
  });
});

it("marks canModify true only for the comment author or an admin", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const author = await seedUser(db);
    const other = await seedUser(db);
    const deal = await seedDeal(db, author.id, "all");
    const note = await seedNoteOnDeal(db, actorFor(author.id), deal.id);
    const created = await createComment(
      db,
      actorFor(author.id),
      { noteId: note.id, body: "mine" },
      signal,
    );
    if (created.ok === false) throw new Error("comment seed failed");

    const asAuthor = await listCommentsForEntity(db, actorFor(author.id), "deal", deal.id, signal);
    expect(asAuthor[0]?.canModify).toBe(true);

    const asOther = await listCommentsForEntity(db, actorFor(other.id), "deal", deal.id, signal);
    expect(asOther[0]?.canModify).toBe(false);

    const asAdmin = await listCommentsForEntity(
      db,
      actorFor(other.id, "admin"),
      "deal",
      deal.id,
      signal,
    );
    expect(asAdmin[0]?.canModify).toBe(true);
  });
});

it("hides comments whose parent note was soft-deleted", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const author = await seedUser(db);
    const actor = actorFor(author.id);
    const deal = await seedDeal(db, author.id, "all");
    const note = await seedNoteOnDeal(db, actor, deal.id);
    const created = await createComment(db, actor, { noteId: note.id, body: "mine" }, signal);
    if (created.ok === false) throw new Error("comment seed failed");

    const removal = await softDeleteNote(db, actor, note.id, signal);
    expect(removal.ok).toBe(true);

    const list = await listCommentsForEntity(db, actor, "deal", deal.id, signal);
    expect(list).toHaveLength(0);
  });
});

it("denies commenting on a note whose parent record is invisible", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const outsider = await seedUser(db);
    const deal = await seedDeal(db, owner.id, "owner");
    const note = await seedNoteOnDeal(db, actorFor(owner.id), deal.id);

    const result = await createComment(
      db,
      actorFor(outsider.id),
      { noteId: note.id, body: "peeking" },
      signal,
    );
    expect(result.ok).toBe(false);
  });
});
