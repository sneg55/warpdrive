// Codex finding F23: canSeeLinkedDeal joined the linked deal to its pipeline but did not
// reject archived pipelines. Because canSeeEmail allows a shared thread when the actor can
// see the linked deal, a thread linked to an archived-pipeline deal could still expose email
// contents to non-owners who no longer see that deal anywhere else.
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { canSeeLinkedDeal } from "./emailVisibility";

describe("canSeeLinkedDeal for archived pipelines", () => {
  it("denies a non-owner on an all-visibility deal whose pipeline is archived", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"], { isArchived: true });
      const [deal] = await db
        .insert(deals)
        .values({
          title: "D",
          pipelineId: p.pipeline.id,
          stageId: p.stages[0]!.id,
          ownerId: owner.id,
          visibilityLevel: "all",
        })
        .returning();
      if (!deal) throw new Error("deal seed failed");

      const actor: AuthUser = {
        id: viewer.id,
        type: "regular",
        isActive: true,
        groupIds: new Set<string>(),
      };
      const seen = await canSeeLinkedDeal(db, actor, deal.id, new AbortController().signal);
      expect(seen).toBe(false);
    });
  });
});
