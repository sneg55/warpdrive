import { describe, expect, it } from "vitest";
import { buildOrgLookup, buildPersonLookup, hasUsableIdentifier } from "./lookup";

describe("buildPersonLookup", () => {
  it("prefers the primary email, the strongest identifier the providers accept", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: "jane@acme.com",
      mappedValues: { "person.linkedinUrl": "https://linkedin.com/in/jane" },
      org: { name: "Acme Inc", domain: "acme.com" },
    });
    expect(out.email).toBe("jane@acme.com");
  });

  // An admin can map person.email onto a text custom field instead of the built-in emails target.
  // Reading only the column left such a record with no identifier, so no provider was ever called.
  it("uses a mapped email when the person has no primary email column value", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: { "person.email": "jane@acme.com" },
      org: null,
    });
    expect(out.email).toBe("jane@acme.com");
    expect(hasUsableIdentifier(out)).toBe(true);
  });

  it("prefers the primary email column over a mapped email", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: "jane@acme.com",
      mappedValues: { "person.email": "stale@acme.com" },
      org: null,
    });
    expect(out.email).toBe("jane@acme.com");
  });

  it("ignores a blank mapped email rather than sending an empty string upstream", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: { "person.email": "   " },
      org: null,
    });
    expect(out.email).toBeUndefined();
    expect(hasUsableIdentifier(out)).toBe(false);
  });

  it("passes the LinkedIn URL through when a mapped custom field holds one", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: { "person.linkedinUrl": "https://linkedin.com/in/jane" },
      org: null,
    });
    expect(out.linkedinUrl).toBe("https://linkedin.com/in/jane");
  });

  it("falls back to name plus the linked organization domain", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: {},
      org: { name: "Acme Inc", domain: "acme.com" },
    });
    expect(out.fullName).toBe("Jane Doe");
    expect(out.companyDomain).toBe("acme.com");
    expect(out.companyName).toBe("Acme Inc");
  });

  // A person with a company custom field but no org link is still identifiable. Ignoring the
  // mapped value made hasUsableIdentifier reject the record and no provider was ever called.
  it("uses a mapped company value when the person has no linked organization", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: {
        "person.companyName": "Acme Inc",
        "person.companyDomain": "https://www.acme.com/about",
      },
      org: null,
    });
    expect(out.companyName).toBe("Acme Inc");
    expect(out.companyDomain).toBe("acme.com");
    expect(hasUsableIdentifier(out)).toBe(true);
  });

  it("prefers the linked organization over a mapped company value", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: { "person.companyName": "Stale Co", "person.companyDomain": "stale.com" },
      org: { name: "Acme Inc", domain: "acme.com" },
    });
    expect(out.companyName).toBe("Acme Inc");
    expect(out.companyDomain).toBe("acme.com");
  });

  it("falls back to name plus the organization name when there is no domain", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: {},
      org: { name: "Acme Inc", domain: null },
    });
    expect(out.companyName).toBe("Acme Inc");
    expect(out.companyDomain).toBeUndefined();
  });

  it("splits a two-part name so providers that want the parts get them", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: {},
      org: { name: "Acme", domain: null },
    });
    expect(out.firstName).toBe("Jane");
    expect(out.lastName).toBe("Doe");
  });

  it("keeps a multi-part surname whole rather than dropping the middle", () => {
    const out = buildPersonLookup({
      name: "Ada van der Berg",
      primaryEmail: null,
      mappedValues: {},
      org: { name: "Acme", domain: null },
    });
    expect(out.firstName).toBe("Ada");
    expect(out.lastName).toBe("van der Berg");
  });

  it("leaves the parts unset for a single-word name rather than inventing a surname", () => {
    const out = buildPersonLookup({
      name: "Prince",
      primaryEmail: null,
      mappedValues: {},
      org: null,
    });
    expect(out.firstName).toBeUndefined();
    expect(out.lastName).toBeUndefined();
    expect(out.fullName).toBe("Prince");
  });

  it("normalises the linked organization's domain before sending it as a company domain", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: {},
      org: { name: "Acme Inc", domain: "https://WWW.Acme.com/team?x=1" },
    });
    expect(out.companyDomain).toBe("acme.com");
  });

  it("drops a company domain that is not host-shaped rather than sending junk", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: null,
      mappedValues: {},
      org: { name: "Acme Inc", domain: "Acme Incorporated" },
    });
    expect(out.companyDomain).toBeUndefined();
    expect(out.companyName).toBe("Acme Inc");
  });

  it("ignores blank values instead of sending empty strings upstream", () => {
    const out = buildPersonLookup({
      name: "Jane Doe",
      primaryEmail: "   ",
      mappedValues: { "person.linkedinUrl": "  " },
      org: { name: "  ", domain: "  " },
    });
    expect(out.email).toBeUndefined();
    expect(out.linkedinUrl).toBeUndefined();
    expect(out.companyName).toBeUndefined();
    expect(out.companyDomain).toBeUndefined();
  });
});

describe("buildOrgLookup", () => {
  it("prefers the domain", () => {
    const out = buildOrgLookup({
      name: "Acme Inc",
      domain: "acme.com",
      linkedinUrl: "https://linkedin.com/company/acme",
      mappedValues: {},
    });
    expect(out.domain).toBe("acme.com");
  });

  // An admin may map org.domain or org.linkedinUrl onto a custom field. Reading only the columns
  // left such an organization identified by name alone, which matches the wrong company.
  it("falls back to a mapped domain when the column is empty", () => {
    const out = buildOrgLookup({
      name: "Acme Inc",
      domain: null,
      linkedinUrl: null,
      mappedValues: { "org.domain": "https://www.Acme.com/about" },
    });
    expect(out.domain).toBe("acme.com");
  });

  it("falls back to a mapped LinkedIn url when the column is empty", () => {
    const out = buildOrgLookup({
      name: "Acme Inc",
      domain: null,
      linkedinUrl: null,
      mappedValues: { "org.linkedinUrl": "https://linkedin.com/company/acme" },
    });
    expect(out.linkedinUrl).toBe("https://linkedin.com/company/acme");
  });

  it("prefers the column over a mapped value", () => {
    const out = buildOrgLookup({
      name: "Acme Inc",
      domain: "acme.com",
      linkedinUrl: null,
      mappedValues: { "org.domain": "stale.test" },
    });
    expect(out.domain).toBe("acme.com");
  });

  it("ignores a blank mapped value rather than sending an empty string upstream", () => {
    const out = buildOrgLookup({
      name: "Acme Inc",
      domain: null,
      linkedinUrl: null,
      mappedValues: { "org.domain": "  ", "org.linkedinUrl": "  " },
    });
    expect(out.domain).toBeUndefined();
    expect(out.linkedinUrl).toBeUndefined();
  });

  it("reduces a website URL stored in the domain column to a bare host", () => {
    expect(
      buildOrgLookup({
        name: "Acme",
        domain: "http://www.Acme.com/about",
        linkedinUrl: null,
        mappedValues: {},
      }).domain,
    ).toBe("acme.com");
    expect(
      buildOrgLookup({ name: "Acme", domain: "acme.com.", linkedinUrl: null, mappedValues: {} })
        .domain,
    ).toBe("acme.com");
    expect(
      buildOrgLookup({
        name: "Acme",
        domain: "https://acme.com:8443",
        linkedinUrl: null,
        mappedValues: {},
      }).domain,
    ).toBe("acme.com");
  });

  it("drops a domain value that is not host-shaped rather than spending a call on it", () => {
    const out = buildOrgLookup({
      name: "Acme Inc",
      domain: "Acme Incorporated",
      linkedinUrl: null,
      mappedValues: {},
    });
    expect(out.domain).toBeUndefined();
    expect(out.name).toBe("Acme Inc");
  });

  it("falls back through LinkedIn to the bare name", () => {
    expect(
      buildOrgLookup({
        name: "Acme",
        domain: null,
        linkedinUrl: "https://li/acme",
        mappedValues: {},
      }).linkedinUrl,
    ).toBe("https://li/acme");
    expect(
      buildOrgLookup({ name: "Acme", domain: null, linkedinUrl: null, mappedValues: {} }).name,
    ).toBe("Acme");
  });
});

describe("hasUsableIdentifier", () => {
  it("accepts an email, a LinkedIn URL, or a name paired with a company", () => {
    expect(hasUsableIdentifier({ email: "a@b.com" })).toBe(true);
    expect(hasUsableIdentifier({ linkedinUrl: "https://li/x" })).toBe(true);
    expect(hasUsableIdentifier({ fullName: "Jane Doe", companyDomain: "acme.com" })).toBe(true);
    expect(hasUsableIdentifier({ fullName: "Jane Doe", companyName: "Acme" })).toBe(true);
  });

  it("rejects a bare name, which matches half the world", () => {
    expect(hasUsableIdentifier({ fullName: "Jane Doe" })).toBe(false);
  });

  it("rejects an empty lookup", () => {
    expect(hasUsableIdentifier({})).toBe(false);
  });

  it("accepts an organization lookup with any one identifier", () => {
    expect(hasUsableIdentifier({ domain: "acme.com" })).toBe(true);
    expect(hasUsableIdentifier({ name: "Acme" })).toBe(true);
  });
});
