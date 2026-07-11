import { afterAll, beforeAll, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import type { DealVisibilitySession } from "@/types/session";
import { getBoardColumns } from "./dealRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});
const session = (id: string): DealVisibilitySession => ({
  userId: id,
  isAdmin: true,
  isActive: true,
  sessionLive: true,
  visibilityGroupIds: [],
  managedUserIds: [] as string[],
});

it("getBoardColumns returns the deal label keys array", async () => {
  const u = await seedUser(h.db);
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Q"]);
  await h.db.insert(deals).values({
    title: "A",
    labels: ["hot", "warm"],
    pipelineId: pipeline.id,
    stageId: stages[0]!.id,
    ownerId: u.id,
    visibilityLevel: "all",
  });
  const { cards } = await getBoardColumns(h.db, session(u.id), pipeline.id, sig());
  expect(cards[0]?.labels).toEqual(["hot", "warm"]);
});
