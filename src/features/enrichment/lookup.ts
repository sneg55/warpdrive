import { pickString } from "./providers/http";
import type { OrgLookup, PersonLookup } from "./providers/types";

export interface PersonLookupSource {
  name: string;
  primaryEmail: string | null;
  // Values already stored under a mapped canonical key. A LinkedIn URL in a custom field is a
  // lookup input as well as an enrichment target, which is what makes match quality improve once
  // an admin maps one.
  mappedValues: Readonly<Record<string, string | number | null>>;
  org: { name: string; domain: string | null } | null;
}

export interface OrgLookupSource {
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  // Values already stored under a mapped canonical key, as on a person. An admin may point
  // org.domain or org.linkedinUrl at a custom field, and reading only the columns would leave such
  // an organization identified by name alone.
  mappedValues: Readonly<Record<string, string | number | null>>;
}

// Labels of a hostname, at least two, so "acme" and "Acme Incorporated" are not offered as hosts.
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// organizations.domain is free text and the UI accepts a full website URL, but every provider keys
// on a bare host and answers nothing for anything else, so a URL costs a call and returns a miss.
function bareDomain(raw: string | null | undefined): string | undefined {
  const value = pickString(raw);
  if (value === undefined) return undefined;
  const authority = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0] ?? "";
  const host = authority
    .split("@")
    .pop()
    ?.split(":")[0]
    ?.replace(/^www\./i, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  return host !== undefined && HOST.test(host) ? host : undefined;
}

function mapped(
  source: { mappedValues: Readonly<Record<string, string | number | null>> },
  key: string,
): string | undefined {
  const raw = source.mappedValues[key];
  return typeof raw === "string" ? pickString(raw) : undefined;
}

// Two words means first + last. More means the surname is compound ("van der Berg") far more often
// than there is a middle name we should drop, so everything after the first word is the surname.
// One word gets no parts at all rather than a fabricated surname.
function splitName(full: string): { firstName?: string; lastName?: string } {
  const parts = full.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length < 2) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function buildPersonLookup(source: PersonLookupSource): PersonLookup {
  const fullName = pickString(source.name);
  const out: PersonLookup = {
    // The column first, then a mapped person.email: an admin can point that key at a text custom
    // field instead of the built-in emails target, and the address is still the best identifier.
    email: pickString(source.primaryEmail) ?? mapped(source, "person.email"),
    linkedinUrl: mapped(source, "person.linkedinUrl"),
    fullName,
    // The linked organization first, then whatever an admin mapped onto the company keys. A person
    // with a company custom field but no org link is still identifiable, and without this fallback
    // hasUsableIdentifier rejects the record and no provider is ever called.
    companyName: pickString(source.org?.name) ?? mapped(source, "person.companyName"),
    companyDomain:
      bareDomain(source.org?.domain) ?? bareDomain(mapped(source, "person.companyDomain")),
  };
  if (fullName !== undefined) Object.assign(out, splitName(fullName));
  return stripUndefined(out);
}

export function buildOrgLookup(source: OrgLookupSource): OrgLookup {
  return stripUndefined({
    domain: bareDomain(source.domain) ?? bareDomain(mapped(source, "org.domain")),
    linkedinUrl: pickString(source.linkedinUrl) ?? mapped(source, "org.linkedinUrl"),
    name: pickString(source.name),
  });
}

// A bare name matches half the world, so it is not an identifier on its own: it needs a company
// beside it. Anything else that reaches a provider would spend a credit on a guess.
export function hasUsableIdentifier(lookup: PersonLookup | OrgLookup): boolean {
  if ("email" in lookup && lookup.email !== undefined) return true;
  if (lookup.linkedinUrl !== undefined) return true;
  if ("domain" in lookup && lookup.domain !== undefined) return true;
  if ("fullName" in lookup && lookup.fullName !== undefined) {
    return lookup.companyDomain !== undefined || lookup.companyName !== undefined;
  }
  return "name" in lookup && lookup.name !== undefined;
}

// Identity-bearing keys only, in a fixed order, so the fingerprint does not depend on how the
// lookup object was assembled. Derived parts (firstName/lastName) are omitted: they add nothing
// the full name does not already carry.
const PERSON_KEYS = ["companyDomain", "companyName", "email", "fullName", "linkedinUrl"] as const;
const ORG_KEYS = ["domain", "linkedinUrl", "name"] as const;

function isOrgLookup(lookup: PersonLookup | OrgLookup): lookup is OrgLookup {
  return "domain" in lookup || "name" in lookup;
}

// Escaped, so a value holding a "|" cannot close its own segment and impersonate a different
// identity by shifting everything after it.
function segment(key: string, value: string | undefined): string {
  const picked = pickString(value);
  const escaped =
    picked === undefined
      ? ""
      : picked.toLowerCase().replaceAll("\\", "\\\\").replaceAll("|", "\\|");
  return `${key}=${escaped}`;
}

// The identity a run was researched for. A run whose fingerprint no longer matches the record
// describes somebody else, so it must not be reused as cache.
export function lookupFingerprint(lookup: PersonLookup | OrgLookup): string {
  const parts = isOrgLookup(lookup)
    ? ORG_KEYS.map((key) => segment(key, lookup[key]))
    : PERSON_KEYS.map((key) => segment(key, lookup[key]));
  return parts.join("|");
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
