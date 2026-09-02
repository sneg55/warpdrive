import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { customFieldColumns } from "./listColumns";

function def(over: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: over.id ?? "d1",
    targetEntity: "person",
    type: "text",
    name: "Region",
    key: "region",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
    ...over,
  };
}

describe("customFieldColumns", () => {
  it("builds one hidden-by-default column per live def, in def order", () => {
    const cols = customFieldColumns([
      def({ id: "b", key: "budget", name: "Budget", type: "monetary", order: 2 }),
      def({ id: "a", key: "region", name: "Region", order: 1 }),
      def({ id: "z", key: "old", name: "Old", order: 0, archivedAt: new Date() }),
    ]);
    expect(cols.map((c) => c.key)).toEqual(["cf:region", "cf:budget"]);
    expect(cols[0]?.header).toBe("Region");
    expect(cols[0]?.defaultVisible).toBe(false);
    expect(cols[0]?.pinned).toBeUndefined();
    expect(cols[0]?.customField.id).toBe("a");
  });

  it("sets sortField only for sortable types", () => {
    const [text, multi] = customFieldColumns([
      def({ id: "t", key: "t", type: "text" }),
      def({ id: "m", key: "m", type: "multi_option" }),
    ]);
    expect(text?.sortField).toBe("cf:t");
    expect(multi?.sortField).toBeUndefined();
  });

  it("skips a def whose key is empty", () => {
    const cols = customFieldColumns([
      def({ id: "e", key: "", name: "!!!" }),
      def({ id: "a", key: "region", name: "Region" }),
    ]);
    expect(cols.map((c) => c.key)).toEqual(["cf:region"]);
  });
});
