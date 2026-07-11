import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEAD_FILTER_FIELDS, LEAD_FILTER_OPS, OPS_BY_LEAD_FIELD } from "./leadFilterFields";

// The Leads Inbox filter builder (a client component) imports OPS_BY_LEAD_FIELD to populate its
// operator dropdown. These constants live in their own zod-free module so importing them does not
// drag zod (~62 KB gzipped) into the /leads client bundle. leads/schemas.ts re-imports them, so
// the server allow-list and the client builder cannot drift apart.
describe("leadFilterFields", () => {
  it("maps every filterable lead field to its valid operators", () => {
    expect(OPS_BY_LEAD_FIELD).toEqual({
      title: ["contains", "eq", "neq"],
      value: ["eq", "neq", "gt", "lt", "gte", "lte"],
      sourceOrigin: ["contains", "eq", "neq"],
      ownerId: ["eq", "neq"],
    });
  });

  it("covers exactly the declared filter fields", () => {
    expect(Object.keys(OPS_BY_LEAD_FIELD).sort()).toEqual([...LEAD_FILTER_FIELDS].sort());
  });

  it("exposes the operator vocabulary", () => {
    expect(LEAD_FILTER_OPS).toContain("contains");
    expect(LEAD_FILTER_OPS).toContain("eq");
  });

  // The whole point of the extraction: this module must stay zod-free so client importers of it
  // never pull zod. A static-import scan is a cheap regression guard against re-inlining.
  it("does not import zod", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./leadFilterFields.ts", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/from ["']zod["']/);
  });
});
