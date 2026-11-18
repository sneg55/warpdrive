import {
  ARRAY_OPS,
  EXACT_OPS,
  type FilterOpKey,
  ORDERED_OPS,
  TEXT_OPS,
} from "@/constants/filterOps";

export type ContactFilterOp = FilterOpKey;

export const CONTACT_ARRAY_FIELDS: readonly string[] = ["labels"];

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

export type ContactFilterDefinition = {
  combinator: "and" | "or";
  conditions: Array<{ field: string; op: ContactFilterOp; value?: string | number | string[] }>;
};
