import { describe, expect, it } from "vitest";
import { orgFieldPatch } from "./orgFields";

const group = {
  name: "Chicago Transit Authority",
  domain: "transitchicago.com",
  industry: "Public Transit",
  linkedinUrl: null,
  employeeCount: 3431,
  annualRevenue: null,
  address: { city: "Chicago", region: "IL" },
};

describe("orgFieldPatch", () => {
  // A newly created org has nothing to protect: take every mapped firmographic. address is
  // excluded here because createOrg already persisted it (see the create-path suite below).
  it("takes every mapped firmographic when not restricted to blanks", () => {
    const patch = orgFieldPatch(group, null, { onlyBlank: false });
    expect(patch).toEqual({
      domain: "transitchicago.com",
      industry: "Public Transit",
      employeeCount: 3431,
    });
  });

  // The whole point of fill-blank: a 115-row import must not silently clobber curated data.
  it("never overwrites a field the existing org already has", () => {
    const existing = {
      domain: "www.transitchicago.com",
      industry: "Transit",
      linkedinUrl: null,
      employeeCount: null,
      annualRevenue: null,
      address: { city: "Chicago" },
    };
    expect(orgFieldPatch(group, existing, { onlyBlank: true })).toEqual({
      employeeCount: 3431,
    });
  });

  it("treats null, undefined, and empty string as blank", () => {
    const existing = {
      domain: null,
      industry: "",
      linkedinUrl: undefined,
      employeeCount: null,
      annualRevenue: null,
      address: null,
    };
    const patch = orgFieldPatch({ ...group, linkedinUrl: "linkedin.com/company/cta" }, existing, {
      onlyBlank: true,
    });
    expect(patch).toEqual({
      domain: "transitchicago.com",
      industry: "Public Transit",
      linkedinUrl: "linkedin.com/company/cta",
      employeeCount: 3431,
      address: { city: "Chicago", region: "IL" },
    });
  });

  // name is the find-or-create key, never a field to write back.
  it("never patches name", () => {
    expect(orgFieldPatch(group, null, { onlyBlank: false })).not.toHaveProperty("name");
    expect(orgFieldPatch(group, { domain: null }, { onlyBlank: true })).not.toHaveProperty("name");
  });

  it("omits fields the row did not map", () => {
    const sparse = {
      name: "NJT",
      domain: null,
      industry: null,
      linkedinUrl: null,
      employeeCount: null,
      annualRevenue: null,
      address: null,
    };
    expect(orgFieldPatch(sparse, null, { onlyBlank: false })).toEqual({});
  });

  it("returns an empty patch when the existing org has every mapped field", () => {
    const existing = {
      domain: "d",
      industry: "i",
      linkedinUrl: "l",
      employeeCount: 5,
      annualRevenue: "1.00",
      address: { city: "x" },
    };
    expect(orgFieldPatch(group, existing, { onlyBlank: true })).toEqual({});
  });
});

// createOrg persists address at creation time (it is on orgCreateInput), but firmographics are
// not, so only they need the post-create updateOrg. Re-patching address there would force an
// updateOrg call, and its contact.edit gate, on a row a create-only user was authorized to run.
describe("orgFieldPatch on the create path (onlyBlank=false)", () => {
  it("excludes address, which createOrg already wrote", () => {
    const patch = orgFieldPatch(
      { name: "NJT", domain: "njtransit.com", address: { city: "Newark" } },
      null,
      { onlyBlank: false },
    );
    expect(patch).toEqual({ domain: "njtransit.com" });
    expect(patch).not.toHaveProperty("address");
  });

  it("is empty when only name and address were mapped (no post-create write needed)", () => {
    const patch = orgFieldPatch({ name: "NJT", address: { city: "Newark" } }, null, {
      onlyBlank: false,
    });
    expect(patch).toEqual({});
  });
});

describe("orgFieldPatch on the enrichment path (onlyBlank=true)", () => {
  it("still fills a blank address on an existing org", () => {
    const patch = orgFieldPatch(
      { name: "CTA", address: { city: "Chicago" } },
      { address: null },
      {
        onlyBlank: true,
      },
    );
    expect(patch).toEqual({ address: { city: "Chicago" } });
  });
});
