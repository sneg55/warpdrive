// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "./columnModel";
import { useColumns } from "./useColumns";

const CATALOG: readonly ColumnDef[] = [
  { key: "title", header: "Title", pinned: true, defaultVisible: true },
  { key: "org", header: "Organization", defaultVisible: true },
  { key: "value", header: "Value", defaultVisible: false },
];

describe("useColumns", () => {
  it("seeds from the initial order and exposes visible descriptors in order", () => {
    const { result } = renderHook(() => useColumns(CATALOG, ["title", "value"]));
    expect(result.current.order).toEqual(["title", "value"]);
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(["title", "value"]);
    expect(result.current.visibleKeys.has("value")).toBe(true);
  });

  it("toggle shows/hides a column; reorder moves it", () => {
    const { result } = renderHook(() => useColumns(CATALOG, undefined));
    void act(() => {
      result.current.toggle("value");
    });
    expect(result.current.order).toEqual(["title", "org", "value"]);
    void act(() => {
      result.current.reorder("value", "org");
    });
    expect(result.current.order).toEqual(["title", "value", "org"]);
  });
});
