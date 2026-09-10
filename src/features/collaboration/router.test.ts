import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeCaller } from "@/server/testCaller";
import { makeTestDb } from "@/test/db";
import { createComment } from "./commentsRepo";
import { createNote } from "./notesRepo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(userId: string): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set(),
  };
}

async function seedDealWithComment(ownerId: string, visibilityLevel: "owner" | "all") {
  const signal = new AbortController().signal;
  const pipe = await seedPipelineWithStages(ctx.db, ["Lead"]);
  const stage = pipe.stages[0];
  if (stage === undefined) throw new Error("stage seed failed");
  const [deal] = await ctx.db
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
  const note = await createNote(
    ctx.db,
    makeActor(ownerId),
    { entityType: "deal", entityId: deal.id, body: "parent", pinned: false },
    signal,
  );
  if (note.ok === false) throw new Error("note seed failed");
  const comment = await createComment(
    ctx.db,
    makeActor(ownerId),
    { noteId: note.value.id, body: "a reply" },
    signal,
  );
  if (comment.ok === false) throw new Error("comment seed failed");
  return { dealId: deal.id, noteId: note.value.id };
}

it("lists the comments on a visible deal's notes", async () => {
  const owner = await seedUser(ctx.db);
  const { dealId, noteId } = await seedDealWithComment(owner.id, "all");
  const caller = makeCaller(ctx.db, makeActor(owner.id));

  const list = await caller.collaboration.listComments({ entityType: "deal", entityId: dealId });
  expect(list).toHaveLength(1);
  expect(list[0]?.body).toBe("a reply");
  expect(list[0]?.noteId).toBe(noteId);
  expect(list[0]?.canModify).toBe(true);
});

it("hides comments on an invisible deal behind NOT_FOUND", async () => {
  const owner = await seedUser(ctx.db);
  const outsider = await seedUser(ctx.db);
  const { dealId } = await seedDealWithComment(owner.id, "owner");
  const caller = makeCaller(ctx.db, makeActor(outsider.id));

  await expect(
    caller.collaboration.listComments({ entityType: "deal", entityId: dealId }),
  ).rejects.toThrow(TRPCError);
});
