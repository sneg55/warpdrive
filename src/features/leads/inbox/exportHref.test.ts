import { describe, expect, it } from "vitest";
import { buildLeadExportHref } from "./exportHref";

const base = {
  filter: "inbox" as const,
  sort: { field: "createdAt", dir: "desc" },
  ownerIds: [] as string[],
  labelKeys: [] as string[],
  nextActivity: null,
  columns: ["title", "value"],
};

describe("buildLeadExportHref", () => {
  it("carries an active inline condition as a JSON `condition` param", () => {
    const href = buildLeadExportHref({
      ...base,
      condition: {
        combinator: "and",
        conditions: [{ field: "title", op: "contains", value: "acme" }],
      },
    });
    const params = new URLSearchParams(href.split("?")[1]);
    const raw = params.get("condition");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      combinator: "and",
      conditions: [{ field: "title", op: "contains", value: "acme" }],
    });
  });

  it("omits the condition param when no inline condition is active", () => {
    const href = buildLeadExportHref({ ...base, condition: null });
    expect(new URLSearchParams(href.split("?")[1]).has("condition")).toBe(false);
  });

  it("includes the filter, sort, and column params", () => {
    const href = buildLeadExportHref({ ...base, condition: null });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("filter")).toBe("inbox");
    expect(params.get("sortField")).toBe("createdAt");
    expect(params.get("sortDir")).toBe("desc");
    expect(params.get("columns")).toBe("title,value");
  });
});
