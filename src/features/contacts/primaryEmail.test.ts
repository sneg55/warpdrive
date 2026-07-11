import { describe, expect, it } from "vitest";
import { derivePrimaryEmail } from "./primaryEmail";

describe("derivePrimaryEmail", () => {
  it("picks the primary-marked email lowercased", () => {
    expect(
      derivePrimaryEmail([
        { label: "work", value: "WORK@A.com", primary: false },
        { label: "home", value: "HOME@A.com", primary: true },
      ]),
    ).toBe("home@a.com");
  });
  it("falls back to the first email when none marked primary", () => {
    expect(derivePrimaryEmail([{ label: "work", value: "First@A.com", primary: false }])).toBe(
      "first@a.com",
    );
  });
  it("returns null when there are no emails", () => {
    expect(derivePrimaryEmail([])).toBeNull();
  });
});
