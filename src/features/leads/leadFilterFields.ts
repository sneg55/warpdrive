import { ARRAY_OPS, EXACT_OPS, FILTER_OP_KEYS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";

export const LEAD_FILTER_FIELDS = ["title", "value", "sourceOrigin", "ownerId", "labels"] as const;
export type LeadFilterField = (typeof LEAD_FILTER_FIELDS)[number];
export const LEAD_FILTER_OPS = FILTER_OP_KEYS;

export const OPS_BY_LEAD_FIELD: Record<LeadFilterField, readonly string[]> = {
  title: TEXT_OPS,
  value: ORDERED_OPS,
  sourceOrigin: TEXT_OPS,
  ownerId: EXACT_OPS,
  labels: ARRAY_OPS,
};

export const LEAD_ARRAY_FIELDS: readonly string[] = ["labels"];

export const LEAD_CONDITION_CONFIG = {
  fields: LEAD_FILTER_FIELDS,
  opsByField: OPS_BY_LEAD_FIELD,
  numericFields: ["value"],
  arrayFields: LEAD_ARRAY_FIELDS,
} as const;
