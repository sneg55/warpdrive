import { describe, expect, it } from "vitest";
import {
  type ColumnDef,
  pinnedKey,
  reorderColumns,
  resolveVisibleOrder,
  toggleColumnOrder,
} from "./columnModel";

const CATALOG: readonly ColumnDef[] = [
  { key: "title", header: "Title", pinned: true, defaultVisible: true },
  { key: "org", header: "Organization", defaultVisible: true },
  { key: "value", header: "Value", defaultVisible: false },
  { key: "owner", header: "Owner", defaultVisible: true },
];

describe("columnModel", () => {
  it("pinnedKey finds the pinned column", () => {
    expect(pinnedKey(CATALOG)).toBe("title");
  });

  it("resolveVisibleOrder falls back to defaults (pinned first) when nothing stored", () => {
    expect(resolveVisibleOrder(CATALOG, undefined)).toEqual(["title", "org", "owner"]);
    expect(resolveVisibleOrder(CATALOG, [])).toEqual(["title", "org", "owner"]);
  });

  it("resolveVisibleOrder honors stored order, keeps pinned first, drops unknown keys", () => {
    expect(resolveVisibleOrder(CATALOG, ["owner", "value", "ghost", "title"])).toEqual([
      "title",
      "owner",
      "value",
    ]);
  });

  it("toggleColumnOrder appends a newly shown column and removes a hidden one", () => {
    expect(toggleColumnOrder(CATALOG, ["title", "org"], "value")).toEqual([
      "title",
      "org",
      "value",
    ]);
    expect(toggleColumnOrder(CATALOG, ["title", "org", "value"], "org")).toEqual([
      "title",
      "value",
    ]);
  });

  it("toggleColumnOrder never hides the pinned column or an unknown key", () => {
    expect(toggleColumnOrder(CATALOG, ["title", "org"], "title")).toEqual(["title", "org"]);
    expect(toggleColumnOrder(CATALOG, ["title", "org"], "ghost")).toEqual(["title", "org"]);
  });

  it("reorderColumns moves a column and refuses to touch the pinned slot", () => {
    expect(reorderColumns(CATALOG, ["title", "org", "owner"], "owner", "org")).toEqual([
      "title",
      "owner",
      "org",
    ]);
    expect(reorderColumns(CATALOG, ["title", "org", "owner"], "org", "title")).toEqual([
      "title",
      "org",
      "owner",
    ]);
  });
});
