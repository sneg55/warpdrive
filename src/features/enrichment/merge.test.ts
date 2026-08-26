import { describe, expect, it } from "vitest";
import { mergeCandidates, normaliseForCompare } from "./merge";
import type { ProviderOutcome } from "./providers/types";
import type { ResolvedMapping } from "./types";

const MAPPINGS: ResolvedMapping[] = [
  {
    canonicalKey: "person.title",
    label: "Job title",
    targetKind: "custom",
    targetKey: null,
    targetFieldDefId: "def-title",
  },
  {
    canonicalKey: "person.linkedinUrl",
    label: "LinkedIn URL",
    targetKind: "custom",
    targetKey: null,
    targetFieldDefId: "def-li",
  },
  {
    canonicalKey: "org.employeeCount",
    label: "Employee count",
    targetKind: "builtin",
    targetKey: "employeeCount",
    targetFieldDefId: null,
  },
];

function outcome(
  provider: ProviderOutcome["provider"],
  fields: Record<string, string | number>,
): ProviderOutcome {
  return { provider, kind: "ok", candidate: { fields } };
}

describe("normaliseForCompare", () => {
  it("trims and case-folds so two providers spelling it differently agree", () => {
    expect(normaliseForCompare("person.title", "  Head of Growth ")).toBe(
      normaliseForCompare("person.title", "head of growth"),
    );
  });

  it("ignores a trailing slash and scheme on URLs", () => {
    expect(normaliseForCompare("person.linkedinUrl", "https://linkedin.com/in/jane/")).toBe(
      normaliseForCompare("person.linkedinUrl", "http://www.linkedin.com/in/jane"),
    );
  });

  it("compares numbers by value, not by formatting", () => {
    expect(normaliseForCompare("org.employeeCount", 240)).toBe(
      normaliseForCompare("org.employeeCount", "240"),
    );
  });
});

describe("mergeCandidates", () => {
  it("credits every provider that supplied the same value", () => {
    const fields = mergeCandidates(
      [
        outcome("apollo", { "person.title": "Head of Growth" }),
        outcome("rocketreach", { "person.title": "head of growth" }),
      ],
      {},
      MAPPINGS,
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]?.values).toHaveLength(1);
    expect(fields[0]?.values[0]?.providers).toEqual(["apollo", "rocketreach"]);
  });

  it("keeps the first spelling seen rather than the normalised form", () => {
    const fields = mergeCandidates(
      [
        outcome("apollo", { "person.title": "Head of Growth" }),
        outcome("rocketreach", { "person.title": "head of growth" }),
      ],
      {},
      MAPPINGS,
    );
    expect(fields[0]?.values[0]?.value).toBe("Head of Growth");
  });

  it("offers every variant when providers disagree", () => {
    const fields = mergeCandidates(
      [
        outcome("apollo", { "person.linkedinUrl": "https://linkedin.com/in/janedoe" }),
        outcome("rocketreach", { "person.linkedinUrl": "https://linkedin.com/in/jane-doe-9" }),
      ],
      {},
      MAPPINGS,
    );
    expect(fields[0]?.values).toHaveLength(2);
  });

  it("selects the variant with the most providers behind it", () => {
    const fields = mergeCandidates(
      [
        outcome("apollo", { "person.title": "VP Growth" }),
        outcome("rocketreach", { "person.title": "Head of Growth" }),
        outcome("getprospect", { "person.title": "Head of Growth" }),
      ],
      {},
      MAPPINGS,
    );
    expect(fields[0]?.selectedValue).toBe("Head of Growth");
  });

  it("breaks a tie by provider priority so the result is deterministic", () => {
    const fields = mergeCandidates(
      [
        outcome("getprospect", { "person.title": "Growth Lead" }),
        outcome("apollo", { "person.title": "Head of Growth" }),
      ],
      {},
      MAPPINGS,
    );
    expect(fields[0]?.selectedValue).toBe("Head of Growth");
  });

  it("pre-selects a row whose target is empty", () => {
    const fields = mergeCandidates([outcome("apollo", { "person.title": "CTO" })], {}, MAPPINGS);
    expect(fields[0]?.defaultSelected).toBe(true);
    expect(fields[0]?.isOverwrite).toBe(false);
  });

  it("leaves an overwrite unchecked and names the value it would replace", () => {
    const fields = mergeCandidates(
      [outcome("apollo", { "person.title": "CTO" })],
      { "person.title": "Engineer" },
      MAPPINGS,
    );
    expect(fields[0]?.isOverwrite).toBe(true);
    expect(fields[0]?.defaultSelected).toBe(false);
    expect(fields[0]?.currentValue).toBe("Engineer");
  });

  it("proposes nothing when the provider agrees with what is already stored", () => {
    const fields = mergeCandidates(
      [outcome("apollo", { "person.title": "Engineer" })],
      { "person.title": "  engineer " },
      MAPPINGS,
    );
    expect(fields).toEqual([]);
  });

  it("drops canonical keys that have no mapping, since there is nowhere to write them", () => {
    const fields = mergeCandidates(
      [outcome("apollo", { "person.seniority": "director" })],
      {},
      MAPPINGS,
    );
    expect(fields).toEqual([]);
  });

  it("ignores outcomes that carry no candidate", () => {
    const fields = mergeCandidates(
      [
        { provider: "apollo", kind: "throttled" },
        { provider: "rocketreach", kind: "no_match" },
      ],
      {},
      MAPPINGS,
    );
    expect(fields).toEqual([]);
  });

  it("returns fields in mapping order so the dialog is stable across runs", () => {
    const fields = mergeCandidates(
      [
        outcome("apollo", {
          "person.linkedinUrl": "https://linkedin.com/in/jane",
          "person.title": "CTO",
        }),
      ],
      {},
      MAPPINGS,
    );
    expect(fields.map((f) => f.canonicalKey)).toEqual(["person.title", "person.linkedinUrl"]);
  });

  it("handles an empty outcome list", () => {
    expect(mergeCandidates([], {}, MAPPINGS)).toEqual([]);
  });
});

// A person's emails are a set, not a single value. Comparing a provider address against the
// primary alone made an address already held as a secondary look like an overwrite of the primary,
// and a cached run kept proposing it forever while the write silently no-opped.
describe("mergeCandidates with a set-valued target", () => {
  const EMAIL: ResolvedMapping[] = [
    {
      canonicalKey: "person.email",
      label: "Email",
      targetKind: "builtin",
      targetKey: "emails",
      targetFieldDefId: null,
    },
  ];

  it("proposes nothing for an address the record already holds as a secondary", () => {
    const fields = mergeCandidates(
      [outcome("apollo", { "person.email": "jane@acme.com" })],
      { "person.email": "primary@acme.com" },
      EMAIL,
      { "person.email": ["primary@acme.com", "jane@acme.com"] },
    );
    expect(fields).toEqual([]);
  });

  it("ignores casing when deciding the address is already held", () => {
    const fields = mergeCandidates(
      [outcome("apollo", { "person.email": "JANE@Acme.com" })],
      { "person.email": "primary@acme.com" },
      EMAIL,
      { "person.email": ["jane@acme.com"] },
    );
    expect(fields).toEqual([]);
  });

  it("proposes a genuinely new address without calling it an overwrite", () => {
    const fields = mergeCandidates(
      [outcome("apollo", { "person.email": "new@acme.com" })],
      { "person.email": "primary@acme.com" },
      EMAIL,
      { "person.email": ["primary@acme.com"] },
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]?.isOverwrite).toBe(false);
    expect(fields[0]?.defaultSelected).toBe(true);
  });
});

// A target can hold something the actor is not allowed to see: a person linked to an organization
// outside their visibility. Reading that as an empty field checks the row by default and the apply
// silently moves the link to a company they picked without ever knowing one was there.
describe("mergeCandidates occupied targets", () => {
  const MAPPING = [
    {
      canonicalKey: "person.companyName",
      label: "Company",
      targetKind: "builtin" as const,
      targetKey: "org",
      targetFieldDefId: null,
    },
  ];
  const OUTCOMES = [
    {
      provider: "apollo" as const,
      kind: "ok" as const,
      candidate: { fields: { "person.companyName": "Initech" } },
    },
  ];

  it("treats an occupied target with no disclosable value as an overwrite", () => {
    const [row] = mergeCandidates(OUTCOMES, { "person.companyName": null }, MAPPING, {}, [
      "person.companyName",
    ]);
    expect(row?.isOverwrite).toBe(true);
    expect(row?.defaultSelected).toBe(false);
    expect(row?.currentValue).toBeNull();
  });

  it("still fills a genuinely empty target by default", () => {
    const [row] = mergeCandidates(OUTCOMES, { "person.companyName": null }, MAPPING, {}, []);
    expect(row?.isOverwrite).toBe(false);
    expect(row?.defaultSelected).toBe(true);
  });
});
