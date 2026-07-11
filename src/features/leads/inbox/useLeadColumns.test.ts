import { describe, expect, it } from "vitest";
import { DEFAULT_VISIBLE_COLUMN_KEYS } from "./columns";
import { reorderColumns, resolveVisibleOrder, toggleColumnOrder } from "./useLeadColumns";

describe("resolveVisibleOrder", () => {
  it("falls back to defaults (Title first) when stored is undefined", () => {
    expect(resolveVisibleOrder(undefined)).toEqual([
      "title",
      ...DEFAULT_VISIBLE_COLUMN_KEYS.filter((k) => k !== "title"),
    ]);
  });

  it("falls back to defaults when stored is empty", () => {
    expect(resolveVisibleOrder([])[0]).toBe("title");
  });

  it("preserves the stored order of known keys", () => {
    expect(resolveVisibleOrder(["title", "owner", "value", "labels"])).toEqual([
      "title",
      "owner",
      "value",
      "labels",
    ]);
  });

  it("forces Title to index 0 even if stored later or omitted", () => {
    expect(resolveVisibleOrder(["owner", "value"])[0]).toBe("title");
    expect(resolveVisibleOrder(["owner", "title", "value"])).toEqual(["title", "owner", "value"]);
  });

  it("drops unknown keys and dedups", () => {
    expect(resolveVisibleOrder(["title", "bogus", "owner", "owner"])).toEqual(["title", "owner"]);
  });
});

describe("toggleColumnOrder", () => {
  it("appends a hidden column to the end", () => {
    expect(toggleColumnOrder(["title", "owner"], "value")).toEqual(["title", "owner", "value"]);
  });

  it("removes a visible non-pinned column", () => {
    expect(toggleColumnOrder(["title", "owner", "value"], "owner")).toEqual(["title", "value"]);
  });

  it("never removes the pinned Title column", () => {
    expect(toggleColumnOrder(["title", "owner"], "title")).toEqual(["title", "owner"]);
  });
});

describe("reorderColumns", () => {
  it("moves a key to another key's position", () => {
    expect(reorderColumns(["title", "owner", "value", "labels"], "labels", "owner")).toEqual([
      "title",
      "labels",
      "owner",
      "value",
    ]);
  });

  it("never moves Title off index 0 (as source or target)", () => {
    expect(reorderColumns(["title", "owner", "value"], "title", "value")).toEqual([
      "title",
      "owner",
      "value",
    ]);
    expect(reorderColumns(["title", "owner", "value"], "value", "title")).toEqual([
      "title",
      "owner",
      "value",
    ]);
  });
});
