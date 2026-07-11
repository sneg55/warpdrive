import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { users } from "./identity";
import { comments, notes } from "./index";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

it("attaches a note to a deal polymorphically and threads a comment", async () => {
  // notes are polymorphic: entity_id is a plain uuid with NO FK, so no deal seed needed.
  const [u] = await h.db
    .insert(users)
    .values({ email: "n@test.com", name: "N", googleSub: "sub-n" })
    .returning();

  const [note] = await h.db
    .insert(notes)
    .values({
      entityType: "deal",
      entityId: crypto.randomUUID(),
      body: "Pinned note",
      pinned: true,
      authorId: u!.id,
    })
    .returning();
  expect(note!.pinned).toBe(true);

  const [comment] = await h.db
    .insert(comments)
    .values({
      noteId: note!.id,
      body: "A comment",
      authorId: u!.id,
    })
    .returning();
  expect(comment!.noteId).toBe(note!.id);
});
