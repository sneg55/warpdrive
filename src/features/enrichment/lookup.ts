import { pickString } from "./providers/http";
import type { OrgLookup, PersonLookup } from "./providers/types";

export interface PersonLookupSource {
  name: string;
  primaryEmail: string | null;
  mappedValues: Readonly<Record<string, string | number | null>>;
  org: { name: string; domain: string | null } | null;
}

export interface OrgLookupSource {
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  mappedValues: Readonly<Record<string, string | number | null>>;
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

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

function splitName(full: string): { firstName?: string; lastName?: string } {
  const parts = full.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length < 2) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function buildPersonLookup(source: PersonLookupSource): PersonLookup {
  const fullName = pickString(source.name);
  const out: PersonLookup = {
    email: pickString(source.primaryEmail) ?? mapped(source, "person.email"),
    linkedinUrl: mapped(source, "person.linkedinUrl"),
    fullName,
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

export function hasUsableIdentifier(lookup: PersonLookup | OrgLookup): boolean {
  if ("email" in lookup && lookup.email !== undefined) return true;
  if (lookup.linkedinUrl !== undefined) return true;
  if ("domain" in lookup && lookup.domain !== undefined) return true;
  if ("fullName" in lookup && lookup.fullName !== undefined) {
    return lookup.companyDomain !== undefined || lookup.companyName !== undefined;
  }
  return "name" in lookup && lookup.name !== undefined;
}

const PERSON_KEYS = ["companyDomain", "companyName", "email", "fullName", "linkedinUrl"] as const;
const ORG_KEYS = ["domain", "linkedinUrl", "name"] as const;

function isOrgLookup(lookup: PersonLookup | OrgLookup): lookup is OrgLookup {
  return "domain" in lookup || "name" in lookup;
}

function segment(key: string, value: string | undefined): string {
  const picked = pickString(value);
  const escaped =
    picked === undefined
      ? ""
      : picked.toLowerCase().replaceAll("\\", "\\\\").replaceAll("|", "\\|");
  return `${key}=${escaped}`;
}

export function lookupFingerprint(lookup: PersonLookup | OrgLookup): string {
  const parts = isOrgLookup(lookup)
    ? ORG_KEYS.map((key) => segment(key, lookup[key]))
    : PERSON_KEYS.map((key) => segment(key, lookup[key]));
  return parts.join("|");
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
