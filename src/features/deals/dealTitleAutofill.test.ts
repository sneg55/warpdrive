import { describe, expect, it } from "vitest";
import { deriveEntityTitle } from "./dealTitleAutofill";

const orgs = [{ id: "o1", name: "Acme Corp" }];
const people = [{ id: "p1", name: "Test Acme User" }];

const base = {
  orgMode: "existing" as const,
  orgId: "",
  newOrgName: "",
  personMode: "existing" as const,
  personId: "",
  newPersonName: "",
};

describe("deriveEntityTitle", () => {
  it("uses a newly-typed org name: '{org} deal'", () => {
    expect(
      deriveEntityTitle({ ...base, orgMode: "new", newOrgName: "Acme Corp" }, orgs, people),
    ).toBe("Acme Corp deal");
  });

  it("uses a newly-typed person name when there is no org", () => {
    expect(
      deriveEntityTitle(
        { ...base, personMode: "new", newPersonName: "test acme user" },
        orgs,
        people,
      ),
    ).toBe("test acme user deal");
  });

  it("prefers the org over the person when both are present", () => {
    expect(
      deriveEntityTitle(
        {
          ...base,
          orgMode: "new",
          newOrgName: "Acme Corp",
          personMode: "new",
          newPersonName: "test acme user",
        },
        orgs,
        people,
      ),
    ).toBe("Acme Corp deal");
  });

  it("resolves an existing org selection to its name", () => {
    expect(deriveEntityTitle({ ...base, orgId: "o1" }, orgs, people)).toBe("Acme Corp deal");
  });

  it("resolves an existing person selection to its name", () => {
    expect(deriveEntityTitle({ ...base, personId: "p1" }, orgs, people)).toBe(
      "Test Acme User deal",
    );
  });

  it("returns an empty string when neither a person nor an org is set", () => {
    expect(deriveEntityTitle(base, orgs, people)).toBe("");
  });

  it("uses the given noun (e.g. 'lead') instead of the default 'deal'", () => {
    expect(
      deriveEntityTitle({ ...base, orgMode: "new", newOrgName: "Acme Corp" }, orgs, people, "lead"),
    ).toBe("Acme Corp lead");
  });

  it("omits the noun when appendNoun is false (auto-prefix preference off)", () => {
    expect(
      deriveEntityTitle(
        { ...base, orgMode: "new", newOrgName: "Acme Corp" },
        orgs,
        people,
        "deal",
        false,
      ),
    ).toBe("Acme Corp");
  });

  it("still returns empty when no contact is set even with appendNoun false", () => {
    expect(deriveEntityTitle(base, orgs, people, "deal", false)).toBe("");
  });
});
