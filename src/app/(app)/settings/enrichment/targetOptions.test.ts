import { describe, expect, it } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { ResolvedMapping } from "@/features/enrichment/types";
import { buildMappingRows, decodeTarget, encodeTarget, NOT_MAPPED_VALUE } from "./targetOptions";

const S = ENRICHMENT_STRINGS.settings;

const BUILTINS = [
  { value: encodeTarget({ kind: "builtin", key: "domain" }), label: "Website / domain" },
  { value: encodeTarget({ kind: "builtin", key: "industry" }), label: "Industry" },
];

function def(id: string, name: string, type: string) {
  return { id, name, type };
}

function builtinMapping(canonicalKey: string, targetKey: string): ResolvedMapping {
  return {
    canonicalKey,
    label: canonicalKey,
    targetKind: "builtin",
    targetKey,
    targetFieldDefId: null,
  };
}

describe("target value encoding", () => {
  it("round-trips a built-in target", () => {
    const encoded = encodeTarget({ kind: "builtin", key: "address.region" });
    expect(decodeTarget(encoded)).toEqual({ kind: "builtin", key: "address.region" });
  });

  it("round-trips a custom target", () => {
    const encoded = encodeTarget({ kind: "custom", fieldDefId: "f1" });
    expect(decodeTarget(encoded)).toEqual({ kind: "custom", fieldDefId: "f1" });
  });

  it("decodes the not-mapped sentinel to null so the caller clears the mapping", () => {
    expect(decodeTarget(NOT_MAPPED_VALUE)).toBeNull();
  });
});

describe("buildMappingRows", () => {
  it("emits one row per canonical key of the entity, labelled from the vocabulary", () => {
    const rows = buildMappingRows("organization", BUILTINS, [], [], new Set());
    const keys = rows.map((r) => r.canonicalKey);
    expect(keys).toContain("org.domain");
    expect(keys).not.toContain("person.email");
    expect(rows.find((r) => r.canonicalKey === "org.domain")?.label).toBe("Website / domain");
  });

  it("offers Not mapped first, then the built-ins, then compatible custom fields", () => {
    const rows = buildMappingRows(
      "organization",
      BUILTINS,
      [],
      [def("f1", "Segment", "text")],
      new Set(),
    );
    const row = rows.find((r) => r.canonicalKey === "org.description");
    expect(row?.options[0]).toEqual({ value: NOT_MAPPED_VALUE, label: S.mappingNotMapped });
    expect(row?.options.map((o) => o.group)).toEqual([
      undefined,
      S.mappingBuiltinGroup,
      S.mappingBuiltinGroup,
      S.mappingCustomGroup,
    ]);
  });

  it("keeps a numeric custom field off a string canonical key and vice versa", () => {
    const defs = [def("f1", "Segment", "text"), def("f2", "Headcount", "numeric")];
    const rows = buildMappingRows("organization", [], [], defs, new Set());
    const description = rows.find((r) => r.canonicalKey === "org.description");
    const employees = rows.find((r) => r.canonicalKey === "org.employeeCount");
    expect(description?.options.map((o) => o.label)).toEqual([S.mappingNotMapped, "Segment"]);
    expect(employees?.options.map((o) => o.label)).toEqual([S.mappingNotMapped, "Headcount"]);
  });

  it("hides a built-in target another canonical key already holds", () => {
    const mappings: ResolvedMapping[] = [builtinMapping("org.domain", "domain")];
    const rows = buildMappingRows("organization", BUILTINS, mappings, [], new Set());
    const website = rows.find((r) => r.canonicalKey === "org.website");
    expect(website?.options.map((o) => o.value)).not.toContain(
      encodeTarget({ kind: "builtin", key: "domain" }),
    );
  });

  it("keeps the row's own target on offer so the selected value renders", () => {
    const mappings: ResolvedMapping[] = [builtinMapping("org.domain", "domain")];
    const rows = buildMappingRows("organization", BUILTINS, mappings, [], new Set());
    const domain = rows.find((r) => r.canonicalKey === "org.domain");
    const encoded = encodeTarget({ kind: "builtin", key: "domain" });
    expect(domain?.options.map((o) => o.value)).toContain(encoded);
    expect(domain?.value).toBe(encoded);
  });

  it("leaves an unclaimed compatible built-in on offer", () => {
    const mappings: ResolvedMapping[] = [builtinMapping("org.domain", "domain")];
    const rows = buildMappingRows("organization", BUILTINS, mappings, [], new Set());
    const website = rows.find((r) => r.canonicalKey === "org.website");
    expect(website?.options.map((o) => o.value)).toContain(
      encodeTarget({ kind: "builtin", key: "industry" }),
    );
    expect(website?.options[0]).toEqual({ value: NOT_MAPPED_VALUE, label: S.mappingNotMapped });
  });

  it("hides a custom field another canonical key already holds, and keeps its owner's", () => {
    const mappings: ResolvedMapping[] = [
      {
        canonicalKey: "org.description",
        label: "Description",
        targetKind: "custom",
        targetKey: null,
        targetFieldDefId: "f1",
      },
    ];
    const defs = [def("f1", "Blurb", "text"), def("f2", "Segment", "text")];
    const rows = buildMappingRows("organization", [], mappings, defs, new Set());
    const name = rows.find((r) => r.canonicalKey === "org.name");
    const description = rows.find((r) => r.canonicalKey === "org.description");
    expect(name?.options.map((o) => o.label)).toEqual([S.mappingNotMapped, "Segment"]);
    expect(description?.options.map((o) => o.label)).toEqual([
      S.mappingNotMapped,
      "Blurb",
      "Segment",
    ]);
  });

  it("omits a built-in target an admin has hidden in Settings > Data fields", () => {
    const rows = buildMappingRows("organization", BUILTINS, [], [], new Set(["industry"]));
    const industry = rows.find((r) => r.canonicalKey === "org.industry");
    expect(industry?.options.map((o) => o.value)).not.toContain(
      encodeTarget({ kind: "builtin", key: "industry" }),
    );
    const domain = rows.find((r) => r.canonicalKey === "org.domain");
    expect(domain?.options.map((o) => o.value)).toContain(
      encodeTarget({ kind: "builtin", key: "domain" }),
    );
  });

  it("omits an address leaf when the address root is hidden", () => {
    const options = [
      { value: encodeTarget({ kind: "builtin", key: "address.city" }), label: "City" },
    ];
    const rows = buildMappingRows("organization", options, [], [], new Set(["address"]));
    const city = rows.find((r) => r.canonicalKey === "org.city");
    expect(city?.options.map((o) => o.value)).toEqual([NOT_MAPPED_VALUE]);
  });

  it("selects the stored target and leaves every other row not mapped", () => {
    const mappings: ResolvedMapping[] = [
      {
        canonicalKey: "org.domain",
        label: "Website / domain",
        targetKind: "builtin",
        targetKey: "domain",
        targetFieldDefId: null,
      },
      {
        canonicalKey: "org.description",
        label: "Description",
        targetKind: "custom",
        targetKey: null,
        targetFieldDefId: "f1",
      },
    ];
    const rows = buildMappingRows(
      "organization",
      BUILTINS,
      mappings,
      [def("f1", "Blurb", "text")],
      new Set(),
    );
    expect(rows.find((r) => r.canonicalKey === "org.domain")?.value).toBe(
      encodeTarget({ kind: "builtin", key: "domain" }),
    );
    expect(rows.find((r) => r.canonicalKey === "org.description")?.value).toBe(
      encodeTarget({ kind: "custom", fieldDefId: "f1" }),
    );
    expect(rows.find((r) => r.canonicalKey === "org.industry")?.value).toBe(NOT_MAPPED_VALUE);
  });
});
