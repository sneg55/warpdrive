import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";
import {
  LEAD_ARRAY_FIELDS,
  LEAD_FILTER_FIELDS,
  LEAD_FILTER_OPS,
  OPS_BY_LEAD_FIELD,
} from "./leadFilterFields";

// The Leads Inbox filter builder (a client component) imports OPS_BY_LEAD_FIELD to populate its
// operator dropdown. These constants live in their own zod-free module so importing them does not
// drag zod (~62 KB gzipped) into the /leads client bundle. leads/schemas.ts re-imports them, so
// the server allow-list and the client builder cannot drift apart.
describe("leadFilterFields", () => {
  // One vocabulary across deals, contacts, and leads: the op classes come from the shared module,
  // so a new operator reaches every entity's dropdown and allow-list at once.
  it("maps every filterable lead field to a shared op class", () => {
    expect(OPS_BY_LEAD_FIELD).toEqual({
      title: TEXT_OPS,
      value: ORDERED_OPS,
      sourceOrigin: TEXT_OPS,
      ownerId: EXACT_OPS,
      labels: ARRAY_OPS,
    });
    expect(OPS_BY_LEAD_FIELD.title).toBe(TEXT_OPS);
    expect(OPS_BY_LEAD_FIELD.value).toBe(ORDERED_OPS);
    expect(OPS_BY_LEAD_FIELD.sourceOrigin).toBe(TEXT_OPS);
    expect(OPS_BY_LEAD_FIELD.ownerId).toBe(EXACT_OPS);
    expect(OPS_BY_LEAD_FIELD.labels).toBe(ARRAY_OPS);
  });

  it("offers the tier 2 operators on text and ordered fields", () => {
    for (const op of ["startsWith", "notContains", "isEmpty", "isNotEmpty"]) {
      expect(OPS_BY_LEAD_FIELD.title).toContain(op);
      expect(LEAD_FILTER_OPS).toContain(op);
    }
    expect(OPS_BY_LEAD_FIELD.value).toContain("isEmpty");
    expect(OPS_BY_LEAD_FIELD.value).not.toContain("startsWith");
  });

  // labels is a text[] of label keys, so it takes only the two array ops.
  it("declares labels as an array field", () => {
    expect(LEAD_FILTER_FIELDS).toContain("labels");
    expect(LEAD_ARRAY_FIELDS).toContain("labels");
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
