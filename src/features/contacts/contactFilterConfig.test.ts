import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";
import {
  CONTACT_ARRAY_FIELDS,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
} from "./contactFilterConfig";

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

  it("offers labels on both entities with the array ops and never as a numeric field", () => {
    for (const config of [PERSON_FILTER_CONFIG, ORG_FILTER_CONFIG]) {
      expect(config.fields).toContain("labels");
      expect(config.opsByField.labels).toEqual(ARRAY_OPS);
      expect(config.numericFields).not.toContain("labels");
      expect(CONTACT_ARRAY_FIELDS).toContain("labels");
    }
  });

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
