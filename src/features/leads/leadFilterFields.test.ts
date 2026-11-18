import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";
import { LEAD_ARRAY_FIELDS, LEAD_FILTER_FIELDS, OPS_BY_LEAD_FIELD } from "./leadFilterFields";

describe("leadFilterFields", () => {
  it("maps every filterable lead field to a shared op class", () => {
    expect(OPS_BY_LEAD_FIELD.title).toBe(TEXT_OPS);
    expect(OPS_BY_LEAD_FIELD.value).toBe(ORDERED_OPS);
    expect(OPS_BY_LEAD_FIELD.sourceOrigin).toBe(TEXT_OPS);
    expect(OPS_BY_LEAD_FIELD.ownerId).toBe(EXACT_OPS);
    expect(OPS_BY_LEAD_FIELD.labels).toBe(ARRAY_OPS);
  });

  it("declares labels as an array field", () => {
    expect(LEAD_FILTER_FIELDS).toContain("labels");
    expect(LEAD_ARRAY_FIELDS).toContain("labels");
  });

  it("does not import zod", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./leadFilterFields.ts", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/from ["']zod["']/);
  });
});
