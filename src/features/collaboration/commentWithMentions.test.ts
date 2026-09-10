import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { comments, deals, mentions, notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { createCommentWithMentions } from "./commentWithMentions";
import { createNote } from "./notesRepo";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

function actorFor(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

async function seedDealWithNote(db: TestDb, ownerId: string) {
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
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal seed failed");
  const note = await createNote(
    db,
    actorFor(ownerId),
    { entityType: "deal", entityId: deal.id, body: "parent note", pinned: false },
    new AbortController().signal,
  );
  if (note.ok === false) throw new Error("note seed failed");
  return { dealId: deal.id, noteId: note.value.id };
}

it("notifies the note author when somebody else comments", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const noteAuthor = await seedUser(db);
    const replier = await seedUser(db);
    const { dealId, noteId } = await seedDealWithNote(db, noteAuthor.id);

    const result = await createCommentWithMentions(
      db,
      actorFor(replier.id),
      { noteId, body: "thoughts?" },
      signal,
    );
    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, noteAuthor.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("comment_reply");
    expect(rows[0]?.entityType).toBe("deal");
    expect(rows[0]?.entityId).toBe(dealId);
    expect(rows[0]?.actorId).toBe(replier.id);
  });
});

it("notifies prior commenters and never the commenter themselves", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const noteAuthor = await seedUser(db);
    const first = await seedUser(db);
    const second = await seedUser(db);
    const { noteId } = await seedDealWithNote(db, noteAuthor.id);

    const a = await createCommentWithMentions(
      db,
      actorFor(first.id),
      { noteId, body: "one" },
      signal,
    );
    const b = await createCommentWithMentions(
      db,
      actorFor(second.id),
      { noteId, body: "two" },
      signal,
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const toFirst = await db.select().from(notifications).where(eq(notifications.userId, first.id));
    expect(toFirst).toHaveLength(1);
    expect(toFirst[0]?.actorId).toBe(second.id);

    const toSecond = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, second.id));
    expect(toSecond).toHaveLength(0);

    const toAuthor = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, noteAuthor.id));
    expect(toAuthor).toHaveLength(2);
  });
});

it("sends a mention instead of a reply when the recipient is @-mentioned in the comment", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const noteAuthor = await seedUser(db, { name: "Ada" });
    const replier = await seedUser(db);
    const { noteId } = await seedDealWithNote(db, noteAuthor.id);

    const result = await createCommentWithMentions(
      db,
      actorFor(replier.id),
      { noteId, body: `over to you @[Ada](${noteAuthor.id})` },
      signal,
    );
    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, noteAuthor.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("mention");

    const mentionRows = await db
      .select()
      .from(mentions)
      .where(eq(mentions.mentionedUserId, noteAuthor.id));
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0]?.source).toBe("comment");
  });
});

it("does not notify anybody when the note author comments on their own note", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const noteAuthor = await seedUser(db);
    const { noteId } = await seedDealWithNote(db, noteAuthor.id);

    const result = await createCommentWithMentions(
      db,
      actorFor(noteAuthor.id),
      { noteId, body: "note to self" },
      signal,
    );
    expect(result.ok).toBe(true);

    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(0);
  });
});

it("keeps a committed comment when the reply email enqueue fails", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const noteAuthor = await seedUser(db);
    const replier = await seedUser(db);
    const { noteId } = await seedDealWithNote(db, noteAuthor.id);

    const dispatch = await import("@/features/notifications/emailDispatch");
    const spy = vi
      .spyOn(dispatch, "enqueueEmailNotification")
      .mockRejectedValue(new Error("queue is down"));

    try {
      const result = await createCommentWithMentions(
        db,
        actorFor(replier.id),
        { noteId, body: "still saved" },
        signal,
      );
      expect(result.ok).toBe(true);
    } finally {
      spy.mockRestore();
    }

    const rows = await db.select().from(comments).where(eq(comments.noteId, noteId));
    expect(rows.map((r) => r.body)).toEqual(["still saved"]);
  });
});
