// Client-safe filter field metadata for the People / Orgs list filter builders. Free of zod,
// drizzle, and @/db/schema so importing it does not drag any of those into the contacts client
// bundle. contactFilter.ts (server) pairs this metadata with a SQL column map to compile filters
// and to build the zod validators, so the client dropdowns and the server allow-list stay aligned.

import {
  ARRAY_OPS,
  EXACT_OPS,
  type FilterOpKey,
  ORDERED_OPS,
  TEXT_OPS,
} from "@/constants/filterOps";

export type ContactFilterOp = FilterOpKey;

// Fields whose column is a text[]. The compiler emits the overlap branch for these, and the
// builder renders a label picker rather than a text box.
export const CONTACT_ARRAY_FIELDS: readonly string[] = ["labels"];

// Per-entity filter field metadata: which fields exist, the ops each field's column type accepts,
// and which fields are numeric (need a parseable numeric value). The SQL column allow-list lives
// server-side in contactFilter.ts, keyed by the same field names.
export interface ContactFilterConfig {
  fields: readonly string[];
  opsByField: Record<string, readonly string[]>;
  numericFields: readonly string[];
  arrayFields: readonly string[];
}

export const PERSON_FILTER_CONFIG: ContactFilterConfig = {
  fields: ["name", "primaryEmail", "ownerId", "labels"],
  opsByField: {
    name: TEXT_OPS,
    primaryEmail: TEXT_OPS,
    ownerId: EXACT_OPS,
    labels: ARRAY_OPS,
  },
  numericFields: [],
  arrayFields: CONTACT_ARRAY_FIELDS,
};

export const ORG_FILTER_CONFIG: ContactFilterConfig = {
  fields: ["name", "industry", "employeeCount", "ownerId", "labels"],
  opsByField: {
    name: TEXT_OPS,
    industry: TEXT_OPS,
    employeeCount: ORDERED_OPS,
    ownerId: EXACT_OPS,
    labels: ARRAY_OPS,
  },
  numericFields: ["employeeCount"],
  arrayFields: CONTACT_ARRAY_FIELDS,
};

// value is absent for the valueless ops (isEmpty / isNotEmpty), which compile to a NULL test.
// A labels condition may carry several names at once ("is any of"), so a value is a scalar or a
// list; every other field takes the scalar.
export type ContactFilterDefinition = {
  combinator: "and" | "or";
  conditions: Array<{ field: string; op: ContactFilterOp; value?: string | number | string[] }>;
};
