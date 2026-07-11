import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ORG_FILTER_CONFIG, PERSON_FILTER_CONFIG } from "./contactFilterConfig";

// The People/Orgs list filter builders (client components) read a filter config's field metadata
// (fields, opsByField, numericFields) to render their dropdowns. This config lives in a module
// free of zod AND drizzle AND @/db/schema, so importing it does not drag all three into the
// contacts client bundle. contactFilter.ts holds the server-only SQL column map and re-uses this
// metadata to build the zod validators, so the client dropdown and server allow-list cannot drift.
describe("contactFilterConfig", () => {
  it("exposes person filter field metadata", () => {
    expect(PERSON_FILTER_CONFIG.fields).toEqual(["name", "primaryEmail", "ownerId"]);
    expect(PERSON_FILTER_CONFIG.opsByField.ownerId).toEqual(["eq", "neq"]);
    expect(PERSON_FILTER_CONFIG.numericFields).toEqual([]);
  });

  it("exposes org filter field metadata including the numeric employeeCount", () => {
    expect(ORG_FILTER_CONFIG.fields).toEqual(["name", "industry", "employeeCount", "ownerId"]);
    expect(ORG_FILTER_CONFIG.numericFields).toEqual(["employeeCount"]);
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
