import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARRAY_OPS, EXACT_OPS, FILTER_OP_KEYS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";
import { DEAL_CONDITION_CONFIG, hasStatusCondition, OPS_BY_FIELD, SORT_DIRS } from "./filterFields";

describe("filterFields", () => {
  it("maps every filterable deal field to a shared operator class", () => {
    expect(OPS_BY_FIELD.title).toBe(TEXT_OPS);
    expect(OPS_BY_FIELD.orgName).toBe(TEXT_OPS);
    expect(OPS_BY_FIELD.value).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.expectedCloseDate).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.nextActivityAt).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.lastActivityAt).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.wonTime).toBe(ORDERED_OPS);
    expect(OPS_BY_FIELD.status).toBe(EXACT_OPS);
    expect(OPS_BY_FIELD.stageId).toBe(EXACT_OPS);
    expect(OPS_BY_FIELD.ownerId).toBe(EXACT_OPS);
    expect(OPS_BY_FIELD.labels).toBe(ARRAY_OPS);
  });

  it("puts contains first on text fields so it is the default op", () => {
    expect(OPS_BY_FIELD.title[0]).toBe("contains");
    expect(OPS_BY_FIELD.orgName[0]).toBe("contains");
  });

  it("validates every date-typed column as a date field", () => {
    expect(DEAL_CONDITION_CONFIG.dateFields).toEqual([
      "expectedCloseDate",
      "nextActivityAt",
      "lastActivityAt",
      "wonTime",
    ]);
  });

  it("exposes the sort vocabulary", () => {
    expect(SORT_DIRS).toEqual(["asc", "desc"]);
  });

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

describe("hasStatusCondition", () => {
  it("is true only when a condition targets the status field", () => {
    expect(hasStatusCondition({ conditions: [{ field: "status" }] })).toBe(true);
    expect(hasStatusCondition({ conditions: [{ field: "title" }, { field: "status" }] })).toBe(
      true,
    );
    expect(hasStatusCondition({ conditions: [{ field: "title" }] })).toBe(false);
    expect(hasStatusCondition({ conditions: [] })).toBe(false);
    expect(hasStatusCondition(undefined)).toBe(false);
    expect(hasStatusCondition(null)).toBe(false);
  });
});
