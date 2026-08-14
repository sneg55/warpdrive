import { describe, expect, it } from "vitest";
import { findPersonMatches, type PersonMatchOption } from "./personMatch";

const OPTIONS: PersonMatchOption[] = [
  {
    id: "p1",
    name: "Steve Tomkiel",
    emails: ["Steve.Tomkiel@sdmts.com"],
    phones: ["+1 (619) 555-0134"],
  },
  { id: "p2", name: "Kali Reyes", emails: ["kali@lametro.net"], phones: [] },
  { id: "p3", name: "No Contact Points", emails: [], phones: [] },
];

const EMPTY = { name: "", email: "", phone: "" };

describe("findPersonMatches", () => {
  it("matches an email regardless of case", () => {
    const m = findPersonMatches({ ...EMPTY, email: "steve.tomkiel@SDMTS.com" }, OPTIONS);
    expect(m).toEqual([{ option: OPTIONS[0], reason: "email" }]);
  });

  it("matches a phone despite different punctuation and spacing", () => {
    const m = findPersonMatches({ ...EMPTY, phone: "619-555-0134" }, OPTIONS);
    expect(m).toEqual([{ option: OPTIONS[0], reason: "phone" }]);
  });

  it("matches a near-duplicate name the way the Add deal combobox does", () => {
    const m = findPersonMatches({ ...EMPTY, name: "Kali Reyez" }, OPTIONS);
    expect(m).toEqual([{ option: OPTIONS[1], reason: "name" }]);
  });

  it("reports a person once, by its strongest signal, when several fields point at them", () => {
    const m = findPersonMatches(
      { name: "Steve Tomkiel", email: "steve.tomkiel@sdmts.com", phone: "6195550134" },
      OPTIONS,
    );
    expect(m).toEqual([{ option: OPTIONS[0], reason: "email" }]);
  });

  it("suggests nothing for an empty draft", () => {
    expect(findPersonMatches(EMPTY, OPTIONS)).toEqual([]);
  });

  it("does not treat a too-short digit string as a phone match", () => {
    // A handful of digits (an extension, a street number) would otherwise collide with any number
    // sharing them, so short inputs must not suggest anyone.
    expect(findPersonMatches({ ...EMPTY, phone: "0134" }, OPTIONS)).toEqual([]);
  });

  it("does not match a partial email fragment", () => {
    expect(findPersonMatches({ ...EMPTY, email: "steve" }, OPTIONS)).toEqual([]);
  });
});
