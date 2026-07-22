import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { buildCustomFieldsSchema, valueSchemaFor } from "./validate";

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: "d1",
  targetEntity: "deal",
  type: "text",
  name: "F",
  key: "f",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: false,
  order: 0,
  archivedAt: null,
  ...over,
});

describe("valueSchemaFor", () => {
  it("accepts a valid single_option id and rejects an unknown one", () => {
    const s = valueSchemaFor(
      def({ type: "single_option", options: [{ id: "opt_a", label: "A" }] }),
    );
    expect(s.safeParse("opt_a").success).toBe(true);
    expect(s.safeParse("opt_x").success).toBe(false);
  });

  it("rejects everything when all single_option options are archived", () => {
    const s = valueSchemaFor(
      def({ type: "single_option", options: [{ id: "opt_a", label: "A", archived: true }] }),
    );
    expect(s.safeParse("opt_a").success).toBe(false);
    expect(s.safeParse("__none__").success).toBe(false);
  });

  it("excludes an archived option from the single_option allow-list", () => {
    const s = valueSchemaFor(
      def({
        type: "single_option",
        options: [
          { id: "opt_a", label: "A" },
          { id: "opt_b", label: "B", archived: true },
        ],
      }),
    );
    expect(s.safeParse("opt_a").success).toBe(true);
    expect(s.safeParse("opt_b").success).toBe(false);
  });

  it("validates a multi_option allow-list and accepts an empty array", () => {
    const s = valueSchemaFor(def({ type: "multi_option", options: [{ id: "opt_a", label: "A" }] }));
    expect(s.safeParse(["opt_a"]).success).toBe(true);
    expect(s.safeParse(["opt_x"]).success).toBe(false);
    expect(s.safeParse([]).success).toBe(true);
  });

  it("rejects date_range with end before start", () => {
    const s = valueSchemaFor(def({ type: "date_range" }));
    expect(s.safeParse({ start: "2026-07-05", end: "2026-07-01" }).success).toBe(false);
    expect(s.safeParse({ start: "2026-07-01", end: "2026-07-05" }).success).toBe(true);
  });

  it("rounds monetary to 2 decimals via multipleOf", () => {
    const s = valueSchemaFor(def({ type: "monetary" }));
    expect(s.safeParse(1500.001).success).toBe(false);
    expect(s.safeParse(1500.5).success).toBe(true);
  });

  it("validates a 24h HH:mm time and rejects 24:00", () => {
    const s = valueSchemaFor(def({ type: "time" }));
    expect(s.safeParse("23:59").success).toBe(true);
    expect(s.safeParse("24:00").success).toBe(false);
  });
});

describe("buildCustomFieldsSchema", () => {
  it("enforces required keys and strips unknown keys", () => {
    const schema = buildCustomFieldsSchema([
      def({ key: "industry", type: "text", isRequired: true }),
    ]);
    expect(schema.safeParse({ industry: "SaaS", junk: 1 }).success).toBe(true);
    const parsed = schema.parse({ industry: "SaaS", junk: 1 });
    expect(parsed).toEqual({ industry: "SaaS" });
    expect(schema.safeParse({}).success).toBe(false); // required missing
  });

  it("ignores archived defs (their key is not validated nor required)", () => {
    const schema = buildCustomFieldsSchema([
      def({ key: "old", type: "text", isRequired: true, archivedAt: new Date() }),
    ]);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("treats Important as required on create and rejects blank values", () => {
    const schema = buildCustomFieldsSchema(
      [def({ key: "seniority", type: "text", isImportant: true })],
      { requireImportant: true },
    );
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ seniority: "   " }).success).toBe(false);
    expect(schema.safeParse({ seniority: "Director" }).success).toBe(true);
  });

  it("keeps Show in add form fields optional", () => {
    const schema = buildCustomFieldsSchema(
      [def({ key: "linkedin", type: "text", showInAddForm: true })],
      { requireImportant: true },
    );
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ linkedin: "https://example.com" }).success).toBe(true);
  });
});
