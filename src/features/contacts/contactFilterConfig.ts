// Client-safe filter field metadata for the People / Orgs list filter builders. Free of zod,
// drizzle, and @/db/schema so importing it does not drag any of those into the contacts client
// bundle. contactFilter.ts (server) pairs this metadata with a SQL column map to compile filters
// and to build the zod validators, so the client dropdowns and the server allow-list stay aligned.

export const CONTACT_FILTER_OPS = ["eq", "neq", "gt", "lt", "gte", "lte", "contains"] as const;
export type ContactFilterOp = (typeof CONTACT_FILTER_OPS)[number];

// "contains" is first so it is the default op for a new text-field condition (Pipedrive defaults
// text filters to a substring match, which is far more useful than exact-equals for names/emails).
const TEXT_OPS = ["contains", "eq", "neq"] as const;
const ORDERED_OPS = ["eq", "neq", "gt", "lt", "gte", "lte"] as const;
const EXACT_OPS = ["eq", "neq"] as const;

// Per-entity filter field metadata: which fields exist, the ops each field's column type accepts,
// and which fields are numeric (need a parseable numeric value). The SQL column allow-list lives
// server-side in contactFilter.ts, keyed by the same field names.
export interface ContactFilterConfig {
  fields: readonly string[];
  opsByField: Record<string, readonly string[]>;
  numericFields: readonly string[];
}

export const PERSON_FILTER_CONFIG: ContactFilterConfig = {
  fields: ["name", "primaryEmail", "ownerId"],
  opsByField: { name: TEXT_OPS, primaryEmail: TEXT_OPS, ownerId: EXACT_OPS },
  numericFields: [],
};

export const ORG_FILTER_CONFIG: ContactFilterConfig = {
  fields: ["name", "industry", "employeeCount", "ownerId"],
  opsByField: {
    name: TEXT_OPS,
    industry: TEXT_OPS,
    employeeCount: ORDERED_OPS,
    ownerId: EXACT_OPS,
  },
  numericFields: ["employeeCount"],
};

export type ContactFilterDefinition = {
  combinator: "and" | "or";
  conditions: Array<{ field: string; op: ContactFilterOp; value: string | number }>;
};
