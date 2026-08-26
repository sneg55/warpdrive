import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, FILTER_OP_KEYS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";
import { FILTER_FIELDS, FILTER_OPS, OPS_BY_FIELD, SORT_DIRS } from "./filterFields";

// The deal filter builder (a client component) imports OPS_BY_FIELD to populate its operator
// dropdown. These constants live in a zod-free module so importing them does not drag zod
// (~62 KB gzipped) into the deals/pipeline client bundle. saved-filters/schemas.ts re-exports
// them and re-validates on the server, so the client dropdown and server allow-list cannot drift.
describe("filterFields", () => {
  // Identity, not deep equality: a copied class would drift the day an operator is added to the
  // shared vocabulary, which is the failure this rewire exists to prevent.
  it("maps every filterable deal field to a shared operator class", () => {
    expect(OPS_BY_FIELD.title).toBe(TEXT_OPS);
    expect(OPS_BY_FIELD.orgName).toBe(TEXT_OPS);
    expect(OPS_BY_FIELD.value).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.expectedCloseDate).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.status).toBe(EXACT_OPS);
    expect(OPS_BY_FIELD.stageId).toBe(EXACT_OPS);
    expect(OPS_BY_FIELD.ownerId).toBe(EXACT_OPS);
    expect(OPS_BY_FIELD.labels).toBe(ARRAY_OPS);
  });

  it("offers the Tier 2 operators on the fields whose column type can run them", () => {
    expect(OPS_BY_FIELD.title).toEqual(
      expect.arrayContaining(["startsWith", "notContains", "isEmpty", "isNotEmpty"]),
    );
    expect(OPS_BY_FIELD.value).toEqual(expect.arrayContaining(["isEmpty", "isNotEmpty"]));
    expect(OPS_BY_FIELD.labels).toEqual(expect.arrayContaining(["isEmpty", "isNotEmpty"]));
    // Identity columns are NOT NULL, so an empty check there can never match.
    expect(OPS_BY_FIELD.ownerId).not.toContain("isEmpty");
  });

  // A new text condition should default to substring match, matching the contacts and leads
  // builders (contactFilterConfig.ts, leadFilter.ts), so "contains" has to sort first.
  it("puts contains first on text fields so it is the default op", () => {
    expect(OPS_BY_FIELD.title[0]).toBe("contains");
    expect(OPS_BY_FIELD.orgName[0]).toBe("contains");
  });

  it("covers exactly the declared filter fields", () => {
    expect(Object.keys(OPS_BY_FIELD).sort()).toEqual([...FILTER_FIELDS].sort());
  });

  it("exposes the shared operator vocabulary and the sort vocabulary", () => {
    expect(FILTER_OPS).toBe(FILTER_OP_KEYS);
    expect(SORT_DIRS).toEqual(["asc", "desc"]);
  });

  // Every op a field offers must be in the enum the server validates against, or the builder can
  // produce a row Zod rejects.
  it("offers no operator outside the shared enum", () => {
    for (const ops of Object.values(OPS_BY_FIELD)) {
      for (const op of ops) expect(FILTER_OP_KEYS).toContain(op);
    }
  });

  it("does not import zod", () => {
    const src = readFileSync(fileURLToPath(new URL("./filterFields.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/from ["']zod["']/);
  });
});
