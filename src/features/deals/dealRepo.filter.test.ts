import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "@/features/deals/dealActions";
import { createSession, visSession } from "@/features/saved-filters/filterAst.test-helpers";
import { getBoardColumns } from "./dealRepo";

describe("getBoardColumns with a FilterDefinition", () => {
  it("narrows to titles matching a contains filter, still visibility-safe", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      for (const t of ["Acme renewal", "Globex expansion", "acme upsell"]) {
        const r = await createDeal(
          db,
          createSession(u.id),
          { title: t, pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
          new AbortController().signal,
        );
        if (r.ok === false) throw new Error("seed failed");
      }

      const all = await getBoardColumns(
        db,
        visSession(u.id),
        p.pipeline.id,
        new AbortController().signal,
      );
      expect(all.cards).toHaveLength(3);

      const filtered = await getBoardColumns(
        db,
        visSession(u.id),
        p.pipeline.id,
        new AbortController().signal,
        { conditions: [{ field: "title", op: "contains", value: "acme" }] },
      );
      expect(filtered.cards.map((c) => c.title).sort()).toEqual(["Acme renewal", "acme upsell"]);
    });
  });
});
