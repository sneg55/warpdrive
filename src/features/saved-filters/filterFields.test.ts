import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FILTER_FIELDS, FILTER_OPS, OPS_BY_FIELD, SORT_DIRS } from "./filterFields";

// The deal filter builder (a client component) imports OPS_BY_FIELD to populate its operator
// dropdown. These constants live in a zod-free module so importing them does not drag zod
// (~62 KB gzipped) into the deals/pipeline client bundle. saved-filters/schemas.ts re-exports
// them and re-validates on the server, so the client dropdown and server allow-list cannot drift.
describe("filterFields", () => {
  it("maps every filterable deal field to its valid operators", () => {
    expect(OPS_BY_FIELD).toEqual({
      title: ["eq", "neq", "contains"],
      orgName: ["eq", "neq", "contains"],
      value: ["eq", "neq", "gt", "lt", "gte", "lte"],
      expectedCloseDate: ["eq", "neq", "gt", "lt", "gte", "lte"],
      status: ["eq", "neq"],
      stageId: ["eq", "neq"],
      ownerId: ["eq", "neq"],
    });
  });

  it("covers exactly the declared filter fields", () => {
    expect(Object.keys(OPS_BY_FIELD).sort()).toEqual([...FILTER_FIELDS].sort());
  });

  it("exposes the operator and sort vocabularies", () => {
    expect(FILTER_OPS).toContain("contains");
    expect(SORT_DIRS).toEqual(["asc", "desc"]);
  });

  it("does not import zod", () => {
    const src = readFileSync(fileURLToPath(new URL("./filterFields.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/from ["']zod["']/);
  });
});
