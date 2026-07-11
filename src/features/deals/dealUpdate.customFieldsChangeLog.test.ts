// Custom-field edit audit logging for updateDeal. Split from dealUpdate.changeLog.test.ts to keep
// that file under the size limit. Seeds real deal custom-field defs so the values pass the
// validateDealCustomFieldsPartial gate the update path now enforces.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { listChangeLog } from "@/features/collaboration/changeLog";
import { createDef } from "@/features/custom-fields/defsRepo";
import { updateDeal } from "./dealActions";
import { adminSession } from "./dealMove.test-helpers";
import { setupDeal } from "./dealUpdate.test-helpers";

describe("updateDeal: custom-field audit logs", () => {
  it("records a change per edited custom field key; a no-op key writes nothing", async () => {
    await withTestDb(async (db) => {
      const { u, deal } = await setupDeal(db);
      const signal = new AbortController().signal;
      // Real active defs: region + tier (text). Their slug keys are "region" / "tier".
      const region = await createDef(
        db,
        { targetEntity: "deal", type: "text", name: "region" },
        signal,
      );
      const tier = await createDef(
        db,
        { targetEntity: "deal", type: "text", name: "tier" },
        signal,
      );
      if (region.ok === false || tier.ok === false) throw new Error("def seed failed");

      // Seed initial custom-field values. .set() does not touch updated_at, so the deal's CAS
      // precondition (deal.updatedAt) still matches after this write.
      const [seeded] = await db
        .update(deals)
        .set({ customFields: { region: "EMEA", tier: "gold" } })
        .where(eq(deals.id, deal.id))
        .returning();
      if (seeded === undefined) throw new Error("setup: customFields seed failed");

      const r = await updateDeal(
        db,
        adminSession(u.id),
        {
          dealId: deal.id,
          expectedUpdatedAt: seeded.updatedAt.toISOString(),
          // region changes EMEA -> APAC; tier is re-submitted unchanged.
          customFields: { region: "APAC", tier: "gold" },
        },
        signal,
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) return;

      const log = await listChangeLog(db, "deal", deal.id, new AbortController().signal);
      const regionChg = log.find((c) => c.field === "custom_field:region");
      expect(regionChg?.oldValue).toBe("EMEA");
      expect(regionChg?.newValue).toBe("APAC");
      expect(regionChg?.actorId).toBe(u.id);
      // The unchanged key logs nothing.
      expect(log.some((c) => c.field === "custom_field:tier")).toBe(false);
    });
  });
});
