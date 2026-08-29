import { describe, expect, test } from "vitest";
import { remainingFields } from "./remainingFields";
import type { ProposedField } from "./types";

function field(canonicalKey: string): ProposedField {
  return {
    canonicalKey,
    label: canonicalKey,
    values: [{ value: "v", providers: ["apollo"] }],
    selectedValue: "v",
    currentValue: null,
    isOverwrite: false,
    currentInvalid: false,
    supportsPrimary: false,
    defaultMakePrimary: false,
    defaultSelected: true,
  };
}

describe("remainingFields", () => {
  test("drops a field that landed, so a retry cannot write it twice", () => {
    const out = remainingFields(
      [field("person.title"), field("person.phone")],
      ["person.title"],
      [],
    );
    expect(out.map((f) => f.canonicalKey)).toEqual(["person.phone"]);
  });

  test("drops a company name no organization matched, because applying it again resolves to nothing", () => {
    const out = remainingFields(
      [field("person.companyName"), field("person.phone")],
      [],
      ["person.companyName"],
    );
    expect(out.map((f) => f.canonicalKey)).toEqual(["person.phone"]);
  });

  test("leaves a field that neither landed nor failed, so an untouched row stays reviewable", () => {
    const out = remainingFields([field("person.title")], [], []);
    expect(out.map((f) => f.canonicalKey)).toEqual(["person.title"]);
  });

  test("an apply that resolved nothing at all leaves no row still offering to apply", () => {
    const out = remainingFields([field("person.companyName")], [], ["person.companyName"]);
    expect(out).toEqual([]);
  });
});
