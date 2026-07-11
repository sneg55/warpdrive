import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { deals, leads } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";

let h: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("a deal round-trips a labels array and a source-channel key", async () => {
  const u = await seedUser(h.db);
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Q"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "Acme",
      labels: ["hot", "warm"],
      sourceChannel: "web_form",
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId: u.id,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("insert failed");
  const [row] = await h.db.select().from(deals).where(eq(deals.id, d.id));
  expect(row?.labels).toEqual(["hot", "warm"]);
  expect(row?.sourceChannel).toBe("web_form");
});

it("labels defaults to an empty array", async () => {
  const u = await seedUser(h.db);
  const [l] = await h.db
    .insert(leads)
    .values({ title: "Lead", ownerId: u.id, visibilityLevel: "all" })
    .returning();
  if (l === undefined) throw new Error("insert failed");
  expect(l.labels).toEqual([]);
});
