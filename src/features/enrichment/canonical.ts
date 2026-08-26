// The one vocabulary every enrichment provider normalises into. Admins map a canonical key to a
// target field ONCE, not once per provider, which is what keeps the mapping UI a single list
// instead of three; which provider supplied a value is carried on the run, not on the mapping.

export type EnrichEntity = "person" | "organization";
export type CanonicalValueType = "string" | "number";

export interface CanonicalField {
  key: string;
  entity: EnrichEntity;
  label: string;
  valueType: CanonicalValueType;
}

const P = (
  key: string,
  label: string,
  valueType: CanonicalValueType = "string",
): CanonicalField => ({
  key: `person.${key}`,
  entity: "person",
  label,
  valueType,
});

const O = (
  key: string,
  label: string,
  valueType: CanonicalValueType = "string",
): CanonicalField => ({
  key: `org.${key}`,
  entity: "organization",
  label,
  valueType,
});

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  P("firstName", "First name"),
  P("lastName", "Last name"),
  P("fullName", "Full name"),
  P("email", "Email"),
  P("title", "Job title"),
  P("seniority", "Seniority"),
  P("department", "Department"),
  P("linkedinUrl", "LinkedIn URL"),
  P("twitterHandle", "X / Twitter handle"),
  P("githubUrl", "GitHub URL"),
  P("photoUrl", "Photo URL"),
  P("city", "City"),
  P("state", "State / region"),
  P("country", "Country"),
  P("companyName", "Company name"),
  P("companyDomain", "Company domain"),
  O("name", "Name"),
  O("domain", "Website / domain"),
  O("website", "Website URL"),
  O("industry", "Industry"),
  O("employeeCount", "Employee count", "number"),
  O("annualRevenue", "Annual revenue", "number"),
  O("linkedinUrl", "LinkedIn URL"),
  O("twitterHandle", "X / Twitter handle"),
  O("description", "Description"),
  O("foundedYear", "Founded year", "number"),
  O("street", "Address: street"),
  O("city", "Address: city"),
  O("state", "Address: state / region"),
  O("postalCode", "Address: postal code"),
  O("country", "Address: country"),
] as const;

const BY_KEY = new Map(CANONICAL_FIELDS.map((f) => [f.key, f]));

export function isCanonicalKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function canonicalField(key: string): CanonicalField | undefined {
  return BY_KEY.get(key);
}

export function canonicalKeysFor(entity: EnrichEntity): string[] {
  return CANONICAL_FIELDS.filter((f) => f.entity === entity).map((f) => f.key);
}

export function valueTypeOf(key: string): CanonicalValueType | undefined {
  return BY_KEY.get(key)?.valueType;
}

// Seeded on first visit to the settings page. Built-ins only: they exist on every install, whereas
// a custom field has to be created before it can be a target. Address leaves reuse the names the
// import mapper already uses (ENTITY_FIELDS.organization), so there is only ever one address shape.
export const DEFAULT_BUILTIN_MAPPINGS: Readonly<Record<string, string>> = {
  "org.domain": "domain",
  "org.industry": "industry",
  "org.employeeCount": "employeeCount",
  "org.annualRevenue": "annualRevenue",
  "org.linkedinUrl": "linkedinUrl",
  "org.street": "address.street",
  "org.city": "address.city",
  "org.state": "address.region",
  "org.postalCode": "address.postal",
  "org.country": "address.country",
  "person.email": "emails",
  "person.companyName": "org",
  "person.firstName": "firstName",
  "person.lastName": "lastName",
};
