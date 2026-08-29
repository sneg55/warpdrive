import { describe, expect, test } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { overwriteNotice } from "./overwriteNotice";
import type { ProposedField } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

function field(over: Partial<ProposedField>): ProposedField {
  return {
    canonicalKey: "person.title",
    label: "Title",
    values: [{ value: "v", providers: ["apollo"] }],
    selectedValue: "v",
    currentValue: "Old",
    isOverwrite: true,
    currentInvalid: false,
    supportsPrimary: false,
    defaultMakePrimary: false,
    defaultSelected: false,
    ...over,
  };
}

describe("overwriteNotice", () => {
  test("says nothing when the field is filling a gap", () => {
    expect(overwriteNotice(field({ isOverwrite: false }))).toBeNull();
  });

  test("names the value a plain field would destroy", () => {
    expect(overwriteNotice(field({ currentValue: "Old" }))).toBe(S.overwrites("Old"));
  });

  test("falls back when the current value is not visible to this user", () => {
    expect(overwriteNotice(field({ currentValue: null }))).toBe(S.overwritesHidden);
  });

  test("a company name relinks the person and renames nothing, so it must not claim an overwrite", () => {
    const notice = overwriteNotice(
      field({
        canonicalKey: "person.companyName",
        currentValue: "Northeastern Colorado Association of Local Governments",
      }),
    );
    expect(notice).toBe(
      S.relinksOrganization("Northeastern Colorado Association of Local Governments"),
    );
    expect(notice).not.toMatch(/overwrite/i);
  });
});
