import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { deleteDeal } from "./deleteDeal";

it("soft-deletes a deal for an admin and 404s an already-deleted id", async () => {
  await withTestDb(async (db) => {
    const admin = await seedUser(db, { isAdmin: true });
    const actor: PermSetUser = {
      id: admin.id,
      type: "admin",
      isActive: true,
      flags: new Set(),
      groupIds: new Set(),
    };
    const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualified"]);
    const [deal] = await db
      .insert(deals)
      .values({
        title: "Acme",
        pipelineId: pipeline.id,
        stageId: stages[0]!.id,
        ownerId: admin.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal insert returned undefined");

    const r1 = await deleteDeal(db, actor, deal.id, AbortSignal.timeout(5000));
    expect(r1.ok).toBe(true);
    const [row] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(row?.deletedAt).not.toBeNull();

    const r2 = await deleteDeal(db, actor, deal.id, AbortSignal.timeout(5000));
    expect(r2.ok).toBe(false);
  });
});
