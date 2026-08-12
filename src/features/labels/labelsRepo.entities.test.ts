import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema/deals";
import { withTestDb } from "@/db/testing";
import { setupDeal } from "@/features/deals/dealUpdate.test-helpers";
import { createLabel, listLabels } from "./labelsRepo";
import { labelsForEntities, setEntityLabels, syncEntityLabelNames } from "./labelsRepo.entities";

async function makeLabel(db: Parameters<typeof createLabel>[0], name: string, color: string) {
  const r = await createLabel(
    db,
    { target: "deal", name, color: color as never },
    new AbortController().signal,
  );
  if (!r.ok) throw new Error("label create failed");
  return r.value;
}

describe("labelsForEntities / setEntityLabels", () => {
  it("replaces an entity's applied labels and reads them back ordered", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const { deal } = await setupDeal(db);
      const hot = await makeLabel(db, "HotX", "red");
      const cold = await makeLabel(db, "ColdX", "blue");

      await setEntityLabels(db, "deal", deal.id, [hot.id, cold.id], signal);
      const map1 = await labelsForEntities(db, "deal", [deal.id], signal);
      expect((map1.get(deal.id) ?? []).map((l) => l.name).sort()).toEqual(["ColdX", "HotX"]);

      // Replacing with a subset drops the removed link.
      await setEntityLabels(db, "deal", deal.id, [hot.id], signal);
      const map2 = await labelsForEntities(db, "deal", [deal.id], signal);
      expect((map2.get(deal.id) ?? []).map((l) => l.name)).toEqual(["HotX"]);

      // Clearing removes all links.
      await setEntityLabels(db, "deal", deal.id, [], signal);
      const map3 = await labelsForEntities(db, "deal", [deal.id], signal);
      expect(map3.get(deal.id) ?? []).toEqual([]);
    });
  });
});

// Writers hold label NAMES (the entity's text[] column is what every read path renders), so the
// name-based wrapper is what keeps the join rows in step with that array.
describe("syncEntityLabelNames", () => {
  it("links names to their catalog rows, matching case-insensitively", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const { deal } = await setupDeal(db);
      await makeLabel(db, "HotX", "red");

      await syncEntityLabelNames(db, "deal", deal.id, ["hotx"], signal);

      const map = await labelsForEntities(db, "deal", [deal.id], signal);
      expect((map.get(deal.id) ?? []).map((l) => l.name)).toEqual(["HotX"]);
    });
  });

  it("adopts an unknown name into the catalog instead of orphaning it", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const { deal } = await setupDeal(db);

      await syncEntityLabelNames(db, "deal", deal.id, ["high priority"], signal);

      const catalog = await listLabels(db, { target: "deal" }, signal);
      const adopted = catalog.find((l) => l.name === "high priority");
      expect(adopted).toBeDefined();
      expect(adopted?.color).toBe("gray");
      const map = await labelsForEntities(db, "deal", [deal.id], signal);
      expect((map.get(deal.id) ?? []).map((l) => l.name)).toEqual(["high priority"]);
    });
  });

  it("adopts an unknown name once, not once per record", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const { deal, u, p } = await setupDeal(db);
      const stage = p.stages[0];
      if (stage === undefined) throw new Error("setup failed");
      const [second] = await db
        .insert(deals)
        .values({
          title: "Second",
          ownerId: u.id,
          pipelineId: p.pipeline.id,
          stageId: stage.id,
          visibilityLevel: "all",
        })
        .returning();
      if (second === undefined) throw new Error("setup failed");

      await syncEntityLabelNames(db, "deal", deal.id, ["shared"], signal);
      await syncEntityLabelNames(db, "deal", second.id, ["Shared"], signal);

      const catalog = await listLabels(db, { target: "deal" }, signal);
      expect(catalog.filter((l) => l.name.toLowerCase() === "shared")).toHaveLength(1);
    });
  });

  it("drops links for names no longer applied", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const { deal } = await setupDeal(db);
      await makeLabel(db, "KeepX", "red");
      await makeLabel(db, "DropX", "blue");

      await syncEntityLabelNames(db, "deal", deal.id, ["KeepX", "DropX"], signal);
      await syncEntityLabelNames(db, "deal", deal.id, ["KeepX"], signal);

      const map = await labelsForEntities(db, "deal", [deal.id], signal);
      expect((map.get(deal.id) ?? []).map((l) => l.name)).toEqual(["KeepX"]);
    });
  });
});
