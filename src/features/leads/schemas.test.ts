import { describe, expect, it } from "vitest";
import { leadConditionInput, leadCreateInput, leadListInput, leadUpdateInput } from "./schemas";

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

// leadConditionInput, not the compiler's own leadFilterSchema, is what lead.list and /leads/export
// validate against, so the valueless ops are only usable if this schema implements the same
// contract the compiler does.
describe("leadConditionInput valueless operators", () => {
  it("accepts a valueless op with the value key omitted", () => {
    for (const op of ["isEmpty", "isNotEmpty"] as const) {
      const r = leadConditionInput.safeParse({
        combinator: "and",
        conditions: [{ field: "title", op }],
      });
      expect(r.success).toBe(true);
    }
  });

  // `value` is the numeric field, so a valueless op there must skip the numeric check too rather
  // than demanding a number nobody typed.
  it("accepts a valueless op on the numeric value field", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "value", op: "isEmpty" }],
    });
    expect(r.success).toBe(true);
  });

  it("still rejects a value-taking op with no value", () => {
    for (const op of ["eq", "gt", "contains"] as const) {
      const field = op === "contains" ? "title" : "value";
      const r = leadConditionInput.safeParse({
        combinator: "and",
        conditions: [{ field, op }],
      });
      expect(r.success).toBe(false);
    }
  });

  it("keeps rejecting a field/op pairing the column type cannot run", () => {
    const r = leadConditionInput.safeParse({
      combinator: "and",
      conditions: [{ field: "ownerId", op: "isEmpty" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valueless condition through the lead.list boundary schema", () => {
    const r = leadListInput.safeParse({
      filters: {
        condition: { combinator: "and", conditions: [{ field: "value", op: "isEmpty" }] },
      },
    });
    expect(r.success).toBe(true);
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

// A lead condition posted without a combinator (an older client, a stored view) means AND.
describe("leadConditionInput combinator", () => {
  it("defaults an absent combinator to and", () => {
    const r = leadConditionInput.safeParse({
      conditions: [{ field: "title", op: "contains", value: "acme" }],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.combinator).toBe("and");
  });

  it("keeps an explicit or", () => {
    const r = leadConditionInput.safeParse({
      combinator: "or",
      conditions: [{ field: "title", op: "contains", value: "acme" }],
    });
    expect(r.success && r.data.combinator).toBe("or");
  });

  it("rejects a combinator outside the vocabulary", () => {
    expect(leadConditionInput.safeParse({ combinator: "xor", conditions: [] }).success).toBe(false);
  });
});

describe("leadListInput sort field", () => {
  it("accepts a cf: custom-field sort key", () => {
    const r = leadListInput.parse({ sort: { field: "cf:score", dir: "asc" } });
    expect(r.sort.field).toBe("cf:score");
  });

  it("rejects an unknown built-in sort field", () => {
    expect(leadListInput.safeParse({ sort: { field: "score", dir: "asc" } }).success).toBe(false);
  });
});
