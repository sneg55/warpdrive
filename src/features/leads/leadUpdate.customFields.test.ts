import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { leads } from "@/db/schema/leads";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { insertLead, session, sig } from "./leadConvert.test-helpers";
import { updateLead } from "./leadUpdate";

describe("updateLead: custom fields", () => {
  it("merges a partial patch, keeping untouched and archived-def keys", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const score = await createDef(
        db,
        { targetEntity: "lead", type: "numeric", name: "Score" },
        sig(),
      );
      const grade = await createDef(
        db,
        { targetEntity: "lead", type: "text", name: "Grade" },
        sig(),
      );
      if (!score.ok || !grade.ok) throw new Error("def seed failed");
      const lead = await insertLead(db, u.id, {
        customFields: { score: 1, grade: "B", legacy: "keep" },
      });

      const r = await updateLead(
        db,
        session(u.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          customFields: { score: 9 },
        },
        sig(),
      );
      expect(r.ok).toBe(true);
      const [row] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(row?.customFields).toEqual({ score: 9, grade: "B", legacy: "keep" });
    });
  });

  it("rejects a bad value before writing", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const score = await createDef(
        db,
        { targetEntity: "lead", type: "numeric", name: "Score" },
        sig(),
      );
      if (!score.ok) throw new Error("def seed failed");
      const lead = await insertLead(db, u.id, { title: "Untouched" });

      const r = await updateLead(
        db,
        session(u.id),
        {
          leadId: lead.id,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          title: "Changed",
          customFields: { score: "high" },
        },
        sig(),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_CF_003");
      const [row] = await db.select().from(leads).where(eq(leads.id, lead.id));
      expect(row?.title).toBe("Untouched");
    });
  });
});
