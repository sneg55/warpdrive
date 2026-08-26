import { describe, expect, it } from "vitest";
import { planOrgUpdate, planPersonUpdate } from "./plan";
import type { ResolvedMapping } from "./types";

function builtin(canonicalKey: string, targetKey: string): ResolvedMapping {
  return {
    canonicalKey,
    label: canonicalKey,
    targetKind: "builtin",
    targetKey,
    targetFieldDefId: null,
  };
}
function custom(canonicalKey: string, id: string): ResolvedMapping {
  return {
    canonicalKey,
    label: canonicalKey,
    targetKind: "custom",
    targetKey: null,
    targetFieldDefId: id,
  };
}

const ORG_MAPPINGS: ResolvedMapping[] = [
  builtin("org.domain", "domain"),
  builtin("org.industry", "industry"),
  builtin("org.employeeCount", "employeeCount"),
  builtin("org.annualRevenue", "annualRevenue"),
  builtin("org.city", "address.city"),
  builtin("org.state", "address.region"),
  custom("org.description", "def-desc"),
];

const PERSON_MAPPINGS: ResolvedMapping[] = [
  builtin("person.email", "emails"),
  builtin("person.companyName", "org"),
  custom("person.title", "def-title"),
];

const ORG_CURRENT = {
  address: null,
  customFieldKeyById: new Map([["def-desc", "description"]]),
};

const PERSON_CURRENT = {
  emails: [] as { label: string; value: string; primary?: boolean }[],
  customFieldKeyById: new Map([["def-title", "job_title"]]),
};

describe("planOrgUpdate", () => {
  it("writes a built-in scalar", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.industry", value: "B2B SaaS" }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.patch.industry).toBe("B2B SaaS");
  });

  it("coerces employee count to an integer, since the column is one", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.employeeCount", value: "240" }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.patch.employeeCount).toBe(240);
  });

  it("rejects an employee count that is not a whole number", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.employeeCount", value: "many" }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok).toBe(false);
  });

  it("renders annual revenue as the decimal string the column accepts", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.annualRevenue", value: 1250000 }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.patch.annualRevenue).toBe("1250000.00");
  });

  it("merges address leaves into one address object rather than five patches", () => {
    const r = planOrgUpdate(
      [
        { canonicalKey: "org.city", value: "San Francisco" },
        { canonicalKey: "org.state", value: "CA" },
      ],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.patch.address).toEqual({ city: "San Francisco", region: "CA" });
  });

  it("preserves address leaves it was not asked to change", () => {
    const r = planOrgUpdate([{ canonicalKey: "org.city", value: "San Francisco" }], ORG_MAPPINGS, {
      ...ORG_CURRENT,
      address: { country: "US", city: "SF" },
    });
    expect(r.ok && r.value.patch.address).toEqual({ country: "US", city: "San Francisco" });
  });

  it("writes a custom field under its key, not its id", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.description", value: "Makes anvils" }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.customEntries).toEqual([{ key: "description", value: "Makes anvils" }]);
  });

  // The whole customFields object never travels in the patch: updateOrg would run it past the
  // active-definition schema and strip the values of archived fields nobody selected.
  it("leaves custom fields out of the patch so untouched keys cannot be stripped", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.description", value: "Makes anvils" }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && "customFields" in r.value.patch).toBe(false);
  });

  it("refuses a selection whose canonical key has no mapping", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.foundedYear", value: 1999 }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok).toBe(false);
  });

  it("refuses a canonical key that does not exist at all", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.notAThing", value: "x" }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok).toBe(false);
  });

  it("reports which fields it applied", () => {
    const r = planOrgUpdate(
      [
        { canonicalKey: "org.industry", value: "B2B SaaS" },
        { canonicalKey: "org.domain", value: "acme.com" },
      ],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.appliedFields.sort()).toEqual(["org.domain", "org.industry"]);
  });

  it("returns an empty patch for an empty selection", () => {
    const r = planOrgUpdate([], ORG_MAPPINGS, ORG_CURRENT);
    expect(r.ok && r.value.appliedFields).toEqual([]);
  });
});

describe("planPersonUpdate", () => {
  it("appends an email as a contact point instead of replacing the list", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.email", value: "jane@acme.com" }],
      PERSON_MAPPINGS,
      { ...PERSON_CURRENT, emails: [{ label: "work", value: "old@acme.com", primary: true }] },
    );
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "old@acme.com", primary: true },
      { label: "work", value: "jane@acme.com", primary: false },
    ]);
  });

  it("makes the first email primary when the person had none", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.email", value: "jane@acme.com" }],
      PERSON_MAPPINGS,
      PERSON_CURRENT,
    );
    expect(r.ok && r.value.patch.emails?.[0]?.primary).toBe(true);
  });

  it("does not add an email the person already has, in any casing", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.email", value: "JANE@acme.com" }],
      PERSON_MAPPINGS,
      { ...PERSON_CURRENT, emails: [{ label: "work", value: "jane@acme.com", primary: true }] },
    );
    expect(r.ok && r.value.patch.emails).toBeUndefined();
    expect(r.ok && r.value.appliedFields).toEqual([]);
  });

  it("hands the company name back for the caller to resolve, never writing an org id blind", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.companyName", value: "Acme Inc" }],
      PERSON_MAPPINGS,
      PERSON_CURRENT,
    );
    expect(r.ok && r.value.orgCandidateName).toBe("Acme Inc");
    expect(r.ok && r.value.patch.orgId).toBeUndefined();
  });

  it("writes a custom field under its key", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.title", value: "CTO" }],
      PERSON_MAPPINGS,
      PERSON_CURRENT,
    );
    expect(r.ok && r.value.customEntries).toEqual([{ key: "job_title", value: "CTO" }]);
  });

  it("refuses a custom mapping whose field def has vanished", () => {
    const r = planPersonUpdate([{ canonicalKey: "person.title", value: "CTO" }], PERSON_MAPPINGS, {
      ...PERSON_CURRENT,
      customFieldKeyById: new Map(),
    });
    expect(r.ok).toBe(false);
  });
});

// mappingsRepo only lets a number-valued canonical key reach a numeric/monetary custom field and a
// string-valued one reach text/large_text/autocomplete, so the plan must write that exact shape.
describe("custom field value coercion", () => {
  const REVENUE_MAPPINGS: ResolvedMapping[] = [custom("org.annualRevenue", "def-rev")];
  const REVENUE_CURRENT = {
    address: null,
    customFieldKeyById: new Map([["def-rev", "revenue"]]),
  };

  it("writes a provider string into a numeric custom field as a number", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.annualRevenue", value: "1,234,567" }],
      REVENUE_MAPPINGS,
      REVENUE_CURRENT,
    );
    expect(r.ok && r.value.customEntries).toEqual([{ key: "revenue", value: 1234567 }]);
  });

  it("rounds to the two decimals a monetary custom field accepts", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.annualRevenue", value: 1234567.891 }],
      REVENUE_MAPPINGS,
      REVENUE_CURRENT,
    );
    expect(r.ok && r.value.customEntries).toEqual([{ key: "revenue", value: 1234567.89 }]);
  });

  it("refuses a numeric custom target when the provider value is not a number", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.annualRevenue", value: "undisclosed" }],
      REVENUE_MAPPINGS,
      REVENUE_CURRENT,
    );
    expect(r.ok).toBe(false);
  });

  it("writes a provider number into a text custom field as a string", () => {
    const r = planOrgUpdate(
      [{ canonicalKey: "org.description", value: 1999 }],
      ORG_MAPPINGS,
      ORG_CURRENT,
    );
    expect(r.ok && r.value.customEntries).toEqual([{ key: "description", value: "1999" }]);
  });

  it("stringifies a provider number on a person custom field too", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.title", value: 7 }],
      PERSON_MAPPINGS,
      PERSON_CURRENT,
    );
    expect(r.ok && r.value.customEntries).toEqual([{ key: "job_title", value: "7" }]);
  });
});
