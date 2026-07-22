import { describe, expect, it } from "vitest";
import { leadConditionInput, leadCreateInput, leadUpdateInput } from "./schemas";

describe("leadConditionInput numeric-field guard", () => {
  it("rejects a non-numeric value for the numeric `value` field", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "value", op: "gt", value: "abc" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a numeric-coercible string value for the `value` field", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "value", op: "gt", value: "1000" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a numeric value for the `value` field", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "value", op: "lte", value: 500 }],
    });
    expect(r.success).toBe(true);
  });

  it("leaves text fields unconstrained (a non-numeric title is fine)", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "title", op: "contains", value: "acme" }],
    });
    expect(r.success).toBe(true);
  });

  // codex final review P2: an operator invalid for the field's column type (e.g. `contains` on the
  // numeric `value` field) passed validation and then threw in compileLeadFilter, turning user input
  // into a tRPC/export failure. Reject the bad field/op pairing at the boundary.
  it("rejects an operator that is invalid for the field (contains on numeric value)", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "value", op: "contains", value: "5" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an ordered operator on a text-only field (gt on sourceOrigin)", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "sourceOrigin", op: "gt", value: "web" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("leadCreateInput labels", () => {
  it("accepts valid label keys", () => {
    const r = leadCreateInput.parse({ title: "A", labels: ["hot", "warm"] });
    expect(r.labels).toEqual(["hot", "warm"]);
  });

  it("dedupes repeated keys", () => {
    const r = leadCreateInput.parse({ title: "A", labels: ["hot", "hot"] });
    expect(r.labels).toEqual(["hot"]);
  });

  it("accepts any catalog label name (no fixed enum) but still enforces shape", () => {
    // Labels are user-managed in the catalog, so an arbitrary name is accepted.
    expect(leadCreateInput.parse({ title: "A", labels: ["Blocker"] }).labels).toEqual(["Blocker"]);
    // Shape is still enforced: an empty name is rejected.
    expect(() => leadCreateInput.parse({ title: "A", labels: [""] })).toThrow();
  });

  it("defaults to an empty array", () => {
    const r = leadCreateInput.parse({ title: "A" });
    expect(r.labels).toEqual([]);
  });
});

describe("leadCreateInput sourceChannel", () => {
  it("accepts a known channel key", () => {
    const r = leadCreateInput.parse({ title: "A", sourceChannel: "web_form" });
    expect(r.sourceChannel).toBe("web_form");
  });

  it("rejects an unknown channel key", () => {
    expect(() => leadCreateInput.parse({ title: "A", sourceChannel: "nope" })).toThrow();
  });

  it("defaults to null", () => {
    const r = leadCreateInput.parse({ title: "A" });
    expect(r.sourceChannel).toBeNull();
  });
});

describe("leadUpdateInput title", () => {
  const base = {
    leadId: "10000000-0000-4000-8000-000000000001",
    expectedUpdatedAt: "2026-07-21T00:00:00.000Z",
  };

  it("trims a valid inline title update", () => {
    expect(leadUpdateInput.parse({ ...base, title: "  Enterprise renewal  " }).title).toBe(
      "Enterprise renewal",
    );
  });

  it("rejects a blank inline title update", () => {
    expect(leadUpdateInput.safeParse({ ...base, title: "   " }).success).toBe(false);
  });
});
