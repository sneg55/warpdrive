// Validates the 0046 backfill migration seeded the Hot/Warm/Cold catalog for the deal/person/org
// targets on the migrated test template, and that the new 'lead' target is usable (labels can be
// created for it, even though the migration cannot seed it in-transaction).
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { createLabel, listLabels } from "./labelsRepo";

describe("label catalog seed (migration 0046)", () => {
  it("seeds Hot/Warm/Cold for deal/person/organization", async () => {
    await withTestDb(async (db) => {
      for (const target of ["deal", "person", "organization"] as const) {
        const names = (await listLabels(db, { target }, new AbortController().signal)).map(
          (l) => l.name,
        );
        expect(names).toEqual(expect.arrayContaining(["Hot", "Warm", "Cold"]));
      }
    });
  });

  it("supports the new 'lead' target: a lead label can be created and listed", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      const created = await createLabel(db, { target: "lead", name: "Hot", color: "red" }, signal);
      expect(created.ok).toBe(true);
      const names = (await listLabels(db, { target: "lead" }, signal)).map((l) => l.name);
      expect(names).toContain("Hot");
    });
  });
});
