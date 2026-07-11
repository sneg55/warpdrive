import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activityTypes, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { archiveDeal } from "@/features/deals/archiveDeal";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { createActivity } from "./repo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

function actor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("rejects creating an activity on an archived deal", async () => {
  const u = await seedUser(h.db);
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "Acme",
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId: u.id,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("deal insert returned undefined");
  const [type] = await h.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("activity type 'call' not found");

  await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());

  const r = await createActivity(
    h.db,
    actor(u.id),
    { typeId: type.id, subject: "Call", dealId: d.id },
    sig(),
  );
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe("E_DEAL_006");
});

it("allows creating an activity on an active (non-archived) deal", async () => {
  const u = await seedUser(h.db);
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "Beta",
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId: u.id,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("deal insert returned undefined");
  const [type] = await h.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("activity type 'call' not found");

  const r = await createActivity(
    h.db,
    actor(u.id),
    { typeId: type.id, subject: "Call", dealId: d.id },
    sig(),
  );
  expect(r.ok).toBe(true);
});
