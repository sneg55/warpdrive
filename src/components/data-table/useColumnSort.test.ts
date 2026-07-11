import { describe, expect, it } from "vitest";
import { cycleSort, effectiveSort } from "./useColumnSort";

const fallback = { field: "createdAt" as const, dir: "desc" as const };

describe("useColumnSort helpers", () => {
  it("cycles asc to desc to null for the same field", () => {
    expect(cycleSort(null, "name")).toEqual({ field: "name", dir: "asc" });
    expect(cycleSort({ field: "name", dir: "asc" }, "name")).toEqual({
      field: "name",
      dir: "desc",
    });
    expect(cycleSort({ field: "name", dir: "desc" }, "name")).toBeNull();
  });

  it("jumps to a new field ascending", () => {
    expect(cycleSort({ field: "name", dir: "desc" }, "value")).toEqual({
      field: "value",
      dir: "asc",
    });
  });

  it("effectiveSort resolves null to the fallback", () => {
    expect(effectiveSort(null, fallback)).toEqual(fallback);
  });

  it("effectiveSort passes a concrete sort through unchanged", () => {
    const s = { field: "value" as const, dir: "asc" as const };
    expect(effectiveSort(s, fallback)).toBe(s);
  });
});
