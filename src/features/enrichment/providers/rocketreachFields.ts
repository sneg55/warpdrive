// RocketReach payload -> canonical keys. Every key here is declared in CANONICAL_FIELDS.
// Phone payloads (`phones`, `phone_numbers`) are read by nothing: phones are out of scope.
import { pickNumber, pickString } from "./http";

const INVALID_SMTP = "invalid";
const VALID_SMTP = "valid";

const PERSON_KEY = {
  fullName: "person.fullName",
  title: "person.title",
  companyName: "person.companyName",
  linkedinUrl: "person.linkedinUrl",
  twitterHandle: "person.twitterHandle",
  githubUrl: "person.githubUrl",
  photoUrl: "person.photoUrl",
  city: "person.city",
  state: "person.state",
  country: "person.country",
  email: "person.email",
} as const;

const ORG_KEY = {
  name: "org.name",
  domain: "org.domain",
  industry: "org.industry",
  employeeCount: "org.employeeCount",
  annualRevenue: "org.annualRevenue",
  linkedinUrl: "org.linkedinUrl",
  description: "org.description",
  foundedYear: "org.foundedYear",
  city: "org.city",
  state: "org.state",
  country: "org.country",
} as const;

export type Fields = Record<string, string | number>;
export type Node = Record<string, unknown>;

function put(fields: Fields, key: string, value: string | number | undefined): void {
  if (value !== undefined) fields[key] = value;
}

export function nodeOf(value: unknown): Node | undefined {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  return first as Node;
}

function twitterHandle(raw: unknown): string | undefined {
  const value = pickString(raw);
  if (value === undefined) return undefined;
  const segments = value.split("/").filter((part) => part.length > 0);
  const last = segments[segments.length - 1] ?? value;
  const handle = (last.split("?")[0] ?? "").replace(/^@+/, "");
  return handle.length > 0 ? handle : undefined;
}

// RocketReach returns every known address with an smtp_valid of "valid", "invalid" or unstated.
// An invalid one is never returned: it would be proposed as a fill and written onto a real contact.
function bestEmail(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  let fallback: string | undefined;
  for (const entry of value) {
    const node = nodeOf(entry);
    if (node === undefined) continue;
    const email = pickString(node.email);
    if (email === undefined) continue;
    const smtp = pickString(node.smtp_valid)?.toLowerCase();
    if (smtp === INVALID_SMTP) continue;
    if (smtp === VALID_SMTP) return email;
    fallback ??= email;
  }
  return fallback;
}

export function personFields(person: Node): Fields {
  const fields: Fields = {};
  put(fields, PERSON_KEY.fullName, pickString(person.name));
  put(fields, PERSON_KEY.title, pickString(person.current_title));
  put(fields, PERSON_KEY.companyName, pickString(person.current_employer));
  put(fields, PERSON_KEY.linkedinUrl, pickString(person.linkedin_url));
  put(fields, PERSON_KEY.twitterHandle, twitterHandle(person.twitter));
  put(fields, PERSON_KEY.githubUrl, pickString(person.github_url));
  put(fields, PERSON_KEY.photoUrl, pickString(person.profile_pic));
  put(fields, PERSON_KEY.city, pickString(person.city));
  put(fields, PERSON_KEY.state, pickString(person.region) ?? pickString(person.state));
  put(fields, PERSON_KEY.country, pickString(person.country));
  put(fields, PERSON_KEY.email, bestEmail(person.emails));
  return fields;
}

export function orgFields(company: Node): Fields {
  const fields: Fields = {};
  put(fields, ORG_KEY.name, pickString(company.name));
  put(fields, ORG_KEY.domain, pickString(company.domain));
  put(fields, ORG_KEY.industry, pickString(company.industry));
  put(fields, ORG_KEY.employeeCount, pickNumber(company.employees));
  put(fields, ORG_KEY.annualRevenue, pickNumber(company.revenue));
  put(fields, ORG_KEY.linkedinUrl, pickString(company.linkedin_url));
  put(fields, ORG_KEY.description, pickString(company.description));
  put(fields, ORG_KEY.foundedYear, pickNumber(company.founded));
  put(fields, ORG_KEY.city, pickString(company.city));
  put(fields, ORG_KEY.state, pickString(company.region) ?? pickString(company.state));
  put(fields, ORG_KEY.country, pickString(company.country));
  return fields;
}

export function sourceId(node: Node): string | undefined {
  return pickString(node.id) ?? pickNumber(node.id)?.toString();
}
