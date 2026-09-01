import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { createDef, setDefFlags } from "./defsRepo";
import { validateCustomFieldsForCreate, validateCustomFieldsPartial } from "./validateForTarget";

const sig = (): AbortSignal => new AbortController().signal;

describe("validateCustomFieldsForCreate", () => {
  it("requires important lead fields and drops unknown keys", async () => {
    await withTestDb(async (db) => {
      const grade = await createDef(
        db,
        { targetEntity: "lead", type: "text", name: "Grade" },
        sig(),
      );
      if (!grade.ok) throw new Error("def seed failed");
      await setDefFlags(db, { id: grade.value.id, isImportant: true, showInAddForm: true }, sig());

      const missing = await validateCustomFieldsForCreate(db, "lead", {}, sig());
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.id).toBe("E_CF_003");

      const good = await validateCustomFieldsForCreate(db, "lead", { grade: "A", nope: 1 }, sig());
      expect(good.ok).toBe(true);
      if (good.ok) expect(good.value).toEqual({ grade: "A" });
    });
  });

  it("validates per target: a deal def is unknown to lead", async () => {
    await withTestDb(async (db) => {
      const r = await createDef(db, { targetEntity: "deal", type: "text", name: "Tier" }, sig());
      if (!r.ok) throw new Error("def seed failed");
      const lead = await validateCustomFieldsForCreate(db, "lead", { tier: "x" }, sig());
      expect(lead.ok).toBe(true);
      if (lead.ok) expect(lead.value).toEqual({});
    });
  });
});

describe("validateCustomFieldsPartial", () => {
  it("rejects an unknown key and a wrong-typed value, coerces a good one", async () => {
    await withTestDb(async (db) => {
      const score = await createDef(
        db,
        { targetEntity: "lead", type: "numeric", name: "Score" },
        sig(),
      );
      if (!score.ok) throw new Error("def seed failed");

      const unknown = await validateCustomFieldsPartial(db, "lead", { missing: 1 }, sig());
      expect(unknown.ok).toBe(false);

      const bad = await validateCustomFieldsPartial(db, "lead", { score: "high" }, sig());
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error.id).toBe("E_CF_003");

      const good = await validateCustomFieldsPartial(db, "lead", { score: 7 }, sig());
      expect(good.ok).toBe(true);
      if (good.ok) expect(good.value).toEqual({ score: 7 });
    });
  });
});
