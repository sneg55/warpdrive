import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { toLeadSort } from "./seedSort";
import { DEFAULT_LEAD_SORT } from "./useLeadSort";

function def(over: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: "d1",
    targetEntity: "lead",
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

describe("toLeadSort", () => {
  it("keeps a built-in field", () => {
    expect(toLeadSort("title", "asc", [])).toEqual({ field: "title", dir: "asc" });
  });

  it("keeps a live sortable custom-field key", () => {
    const defs = [def({ key: "region", type: "text" })];
    expect(toLeadSort("cf:region", "desc", defs)).toEqual({ field: "cf:region", dir: "desc" });
  });

  it("falls back to the default when the custom-field key is archived", () => {
    const defs = [def({ key: "region", type: "text", archivedAt: new Date() })];
    expect(toLeadSort("cf:region", "asc", defs)).toEqual(DEFAULT_LEAD_SORT);
  });

  it("falls back to the default when the custom-field type is not sortable", () => {
    const defs = [def({ key: "notes", type: "large_text" })];
    expect(toLeadSort("cf:notes", "asc", defs)).toEqual(DEFAULT_LEAD_SORT);
  });

  it("falls back to the default for a garbage string", () => {
    expect(toLeadSort("not-a-real-field", "asc", [])).toEqual(DEFAULT_LEAD_SORT);
  });
});
