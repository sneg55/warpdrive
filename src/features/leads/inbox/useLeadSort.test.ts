import { describe, expect, it } from "vitest";
import { cycleSort, DEFAULT_LEAD_SORT, effectiveSort } from "./useLeadSort";

describe("cycleSort", () => {
  it("first click on a fresh column sorts ascending", () => {
    expect(cycleSort(null, "title")).toEqual({ field: "title", dir: "asc" });
  });

  it("second click on the same column flips to descending", () => {
    expect(cycleSort({ field: "title", dir: "asc" }, "title")).toEqual({
      field: "title",
      dir: "desc",
    });
  });

  it("third click on the same column returns to default (null)", () => {
    expect(cycleSort({ field: "title", dir: "desc" }, "title")).toBeNull();
  });

  it("clicking a different column jumps to that column ascending", () => {
    expect(cycleSort({ field: "title", dir: "desc" }, "value")).toEqual({
      field: "value",
      dir: "asc",
    });
  });

  it("only one column is ever active (switching resets direction)", () => {
    const afterTitle = cycleSort(null, "title");
    const afterOwner = cycleSort(afterTitle, "ownerName");
    expect(afterOwner).toEqual({ field: "ownerName", dir: "asc" });
  });
});

describe("effectiveSort", () => {
  it("resolves null to the default createdAt desc", () => {
    expect(effectiveSort(null)).toEqual(DEFAULT_LEAD_SORT);
    expect(DEFAULT_LEAD_SORT).toEqual({ field: "createdAt", dir: "desc" });
  });

  it("passes a concrete sort through unchanged", () => {
    const s = { field: "value", dir: "asc" } as const;
    expect(effectiveSort(s)).toBe(s);
  });
});
