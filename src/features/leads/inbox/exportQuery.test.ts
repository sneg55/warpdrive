import { describe, expect, it } from "vitest";
import { leadExportQuery } from "./exportQuery";

describe("leadExportQuery", () => {
  it("applies defaults for a bare request", () => {
    const r = leadExportQuery.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.filter).toBe("inbox");
      expect(r.data.sort).toEqual({ field: "createdAt", dir: "desc" });
      expect(r.data.filters.ownerIds).toBeUndefined();
    }
  });

  it("splits comma-joined owner/column params and passes through filter + sort", () => {
    const r = leadExportQuery.safeParse({
      filter: "archived",
      sortField: "title",
      sortDir: "asc",
      ownerIds: "11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222",
      labelKeys: "warm",
      nextActivity: "today",
      columns: "title,owner,value",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.filter).toBe("archived");
      expect(r.data.sort).toEqual({ field: "title", dir: "asc" });
      expect(r.data.filters.ownerIds).toHaveLength(2);
      expect(r.data.filters.labelKeys).toEqual(["warm"]);
      expect(r.data.filters.nextActivity).toBe("today");
      expect(r.data.columns).toEqual(["title", "owner", "value"]);
    }
  });

  it("rejects an unknown sort field", () => {
    expect(leadExportQuery.safeParse({ sortField: "bogus" }).success).toBe(false);
  });

  it("parses a JSON `condition` param into filters.condition", () => {
    const condition = {
      combinator: "and",
      conditions: [{ field: "title", op: "contains", value: "acme" }],
    };
    const r = leadExportQuery.safeParse({ condition: JSON.stringify(condition) });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.filters.condition).toEqual(condition);
  });

  it("drops a malformed condition param instead of applying a broken filter", () => {
    const r = leadExportQuery.safeParse({ condition: "not-json" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.filters.condition).toBeUndefined();
  });

  it("drops a condition whose numeric value is non-numeric (boundary guard)", () => {
    const bad = {
      combinator: "and",
      conditions: [{ field: "value", op: "gt", value: "abc" }],
    };
    const r = leadExportQuery.safeParse({ condition: JSON.stringify(bad) });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.filters.condition).toBeUndefined();
  });
});
