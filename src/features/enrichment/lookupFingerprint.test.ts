import { describe, expect, it } from "vitest";
import { buildOrgLookup, buildPersonLookup, lookupFingerprint } from "./lookup";

describe("lookupFingerprint", () => {
  const jane = {
    name: "Jane Doe",
    primaryEmail: "jane@acme.com",
    mappedValues: {},
    org: { name: "Acme Inc", domain: "acme.com" },
  };

  it("changes when the email changes, because the research is no longer about that person", () => {
    const a = lookupFingerprint(buildPersonLookup(jane));
    const b = lookupFingerprint(buildPersonLookup({ ...jane, primaryEmail: "jane@other.com" }));
    expect(a).not.toBe(b);
  });

  it("changes when a mapped email changes, so a record identified only that way is not cached", () => {
    const mappedOnly = { name: "Jane Doe", primaryEmail: null, mappedValues: {}, org: null };
    const a = lookupFingerprint(
      buildPersonLookup({ ...mappedOnly, mappedValues: { "person.email": "jane@acme.com" } }),
    );
    const b = lookupFingerprint(
      buildPersonLookup({ ...mappedOnly, mappedValues: { "person.email": "jane@other.com" } }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when the linked organization changes", () => {
    const a = lookupFingerprint(buildPersonLookup(jane));
    const b = lookupFingerprint(
      buildPersonLookup({ ...jane, org: { name: "Globex", domain: "globex.com" } }),
    );
    expect(a).not.toBe(b);
  });

  it("ignores casing and surrounding whitespace", () => {
    const a = lookupFingerprint(buildPersonLookup(jane));
    const b = lookupFingerprint(
      buildPersonLookup({
        ...jane,
        name: "  Jane Doe  ",
        primaryEmail: "JANE@Acme.com ",
        org: { name: "ACME Inc", domain: "https://www.Acme.com/" },
      }),
    );
    expect(a).toBe(b);
  });

  it("does not depend on the order the lookup keys were written in", () => {
    const a = lookupFingerprint({ fullName: "Jane Doe", email: "jane@acme.com" });
    const b = lookupFingerprint({ email: "jane@acme.com", fullName: "Jane Doe" });
    expect(a).toBe(b);
  });

  it("ignores fields that carry no identity, so a derived name part is not a cache miss", () => {
    const a = lookupFingerprint(buildPersonLookup(jane));
    const b = lookupFingerprint({ ...buildPersonLookup(jane), firstName: "Janet" });
    expect(a).toBe(b);
  });

  it("cannot be forged by a value that contains the delimiter", () => {
    const smuggled = lookupFingerprint(
      buildPersonLookup({
        name: "Jane Doe",
        primaryEmail: null,
        mappedValues: { "person.companyName": "Acme|email=x@y.com" },
        org: null,
      }),
    );
    const genuine = lookupFingerprint(
      buildPersonLookup({
        name: "Jane Doe",
        primaryEmail: "x@y.com|email=",
        mappedValues: { "person.companyName": "Acme" },
        org: null,
      }),
    );
    expect(smuggled).not.toBe(genuine);
  });

  it("changes when an organization's domain or name changes", () => {
    const base = { name: "Acme", domain: "acme.com", linkedinUrl: null, mappedValues: {} };
    const a = lookupFingerprint(buildOrgLookup(base));
    expect(a).not.toBe(lookupFingerprint(buildOrgLookup({ ...base, domain: "globex.com" })));
    expect(a).not.toBe(lookupFingerprint(buildOrgLookup({ ...base, name: "Globex" })));
  });
});
