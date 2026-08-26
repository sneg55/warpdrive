import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";
import {
  CONTACT_ARRAY_FIELDS,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
} from "./contactFilterConfig";

// The People/Orgs list filter builders (client components) read a filter config's field metadata
// (fields, opsByField, numericFields) to render their dropdowns. This config lives in a module
// free of zod AND drizzle AND @/db/schema, so importing it does not drag all three into the
// contacts client bundle. contactFilter.ts holds the server-only SQL column map and re-uses this
// metadata to build the zod validators, so the client dropdown and server allow-list cannot drift.
describe("contactFilterConfig", () => {
  it("exposes person filter field metadata", () => {
    expect(PERSON_FILTER_CONFIG.fields).toEqual(["name", "primaryEmail", "ownerId", "labels"]);
    expect(PERSON_FILTER_CONFIG.opsByField.ownerId).toEqual(["eq", "neq"]);
    expect(PERSON_FILTER_CONFIG.numericFields).toEqual([]);
  });

  it("exposes org filter field metadata including the numeric employeeCount", () => {
    expect(ORG_FILTER_CONFIG.fields).toEqual([
      "name",
      "industry",
      "employeeCount",
      "ownerId",
      "labels",
    ]);
    expect(ORG_FILTER_CONFIG.numericFields).toEqual(["employeeCount"]);
  });

  // labels is a text[] of label keys: it takes only "is" / "is not" (compiled to array overlap),
  // and it must never be treated as numeric or the builder would coerce the key to NaN.
  it("offers labels on both entities with the array ops and never as a numeric field", () => {
    for (const config of [PERSON_FILTER_CONFIG, ORG_FILTER_CONFIG]) {
      expect(config.fields).toContain("labels");
      expect(config.opsByField.labels).toEqual(ARRAY_OPS);
      expect(config.numericFields).not.toContain("labels");
      expect(CONTACT_ARRAY_FIELDS).toContain("labels");
    }
  });

  // One vocabulary across deals, contacts, and leads: the op classes come from the shared module,
  // so a new operator reaches every entity's dropdown and allow-list at once.
  it("sources every field's ops from the shared op classes", () => {
    expect(PERSON_FILTER_CONFIG.opsByField.name).toBe(TEXT_OPS);
    expect(PERSON_FILTER_CONFIG.opsByField.primaryEmail).toBe(TEXT_OPS);
    expect(PERSON_FILTER_CONFIG.opsByField.ownerId).toBe(EXACT_OPS);
    expect(PERSON_FILTER_CONFIG.opsByField.labels).toBe(ARRAY_OPS);
    expect(ORG_FILTER_CONFIG.opsByField.name).toBe(TEXT_OPS);
    expect(ORG_FILTER_CONFIG.opsByField.industry).toBe(TEXT_OPS);
    expect(ORG_FILTER_CONFIG.opsByField.employeeCount).toBe(ORDERED_OPS);
    expect(ORG_FILTER_CONFIG.opsByField.ownerId).toBe(EXACT_OPS);
    expect(ORG_FILTER_CONFIG.opsByField.labels).toBe(ARRAY_OPS);
  });

  it("offers the tier 2 operators on text and ordered fields", () => {
    for (const op of ["startsWith", "notContains", "isEmpty", "isNotEmpty"]) {
      expect(PERSON_FILTER_CONFIG.opsByField.name).toContain(op);
    }
    expect(ORG_FILTER_CONFIG.opsByField.employeeCount).toContain("isEmpty");
    expect(ORG_FILTER_CONFIG.opsByField.employeeCount).not.toContain("startsWith");
  });

  it("does not import zod, drizzle, or the db schema", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./contactFilterConfig.ts", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/from ["']zod["']/);
    expect(src).not.toMatch(/from ["']drizzle-orm["']/);
    expect(src).not.toMatch(/from ["']@\/db\/schema["']/);
  });
});
