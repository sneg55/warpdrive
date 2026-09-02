import { describe, expect, it } from "vitest";
import {
  customFieldColumnKey,
  customFieldKeyFromColumn,
  isCustomFieldSortKey,
  isSortableCustomFieldType,
} from "./sortKey";

describe("sortKey", () => {
  it("round-trips a def key through the column key", () => {
    expect(customFieldColumnKey({ key: "deal_source" })).toBe("cf:deal_source");
    expect(customFieldKeyFromColumn("cf:deal_source")).toBe("deal_source");
    expect(customFieldKeyFromColumn("title")).toBeUndefined();
  });

  it("recognises only slug-shaped cf keys", () => {
    expect(isCustomFieldSortKey("cf:deal_source")).toBe(true);
    expect(isCustomFieldSortKey("cf:Deal Source")).toBe(false);
    expect(isCustomFieldSortKey("cf:")).toBe(false);
    expect(isCustomFieldSortKey("createdAt")).toBe(false);
  });

  it("marks scalar types sortable and multi-value or reference types not", () => {
    for (const t of [
      "text",
      "autocomplete",
      "phone",
      "numeric",
      "monetary",
      "date",
      "time",
      "single_option",
    ] as const)
      expect(isSortableCustomFieldType(t)).toBe(true);
    for (const t of [
      "large_text",
      "multi_option",
      "date_range",
      "time_range",
      "address",
      "user",
      "person",
      "org",
    ] as const)
      expect(isSortableCustomFieldType(t)).toBe(false);
  });
});
