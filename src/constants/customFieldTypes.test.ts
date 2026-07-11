import { describe, expect, it } from "vitest";
import { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from "./customFieldTypes";

describe("custom field constants", () => {
  it("lists all 16 Pipedrive field types", () => {
    expect(CUSTOM_FIELD_TYPES).toEqual([
      "text",
      "large_text",
      "single_option",
      "multi_option",
      "autocomplete",
      "numeric",
      "monetary",
      "user",
      "org",
      "person",
      "phone",
      "time",
      "time_range",
      "date",
      "date_range",
      "address",
    ]);
  });

  it("scopes defs to four target entities", () => {
    expect(CUSTOM_FIELD_TARGETS).toEqual(["deal", "person", "organization", "activity"]);
  });
});
