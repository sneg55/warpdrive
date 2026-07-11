import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { setupDeal } from "@/features/deals/dealUpdate.test-helpers";
import { createLabel } from "./labelsRepo";
import { labelsForEntities, setEntityLabels } from "./labelsRepo.entities";

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
