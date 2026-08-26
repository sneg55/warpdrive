// Zod-free field/operator allow-list for the Leads Inbox inline filter builder. Kept separate
// from leads/schemas.ts (which imports zod) so the client filter builder can import these
// constants without pulling zod (~62 KB gzipped) into the /leads bundle. leads/schemas.ts
// re-exports these and re-validates on the server, so the client dropdown and the server
// allow-list stay in lockstep.

import { ARRAY_OPS, EXACT_OPS, FILTER_OP_KEYS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";

export const LEAD_FILTER_FIELDS = ["title", "value", "sourceOrigin", "ownerId", "labels"] as const;
export type LeadFilterField = (typeof LEAD_FILTER_FIELDS)[number];
export const LEAD_FILTER_OPS = FILTER_OP_KEYS;

// Which operators each lead field's column type can run (mirrors the server leadFilter allow-list).
// Client-safe so the inline builder can restrict its op dropdown to valid pairings.
export const OPS_BY_LEAD_FIELD: Record<LeadFilterField, readonly string[]> = {
  title: TEXT_OPS,
  value: ORDERED_OPS,
  sourceOrigin: TEXT_OPS,
  ownerId: EXACT_OPS,
  labels: ARRAY_OPS,
};

// Fields whose column is a text[]; the compiler emits the overlap branch for these.
export const LEAD_ARRAY_FIELDS: readonly string[] = ["labels"];

// Column classes that need a value check beyond the op pairing. Fed to the shared condition
// validator in src/schemas/filterCondition.ts by both leads/schemas.ts and the saved-view schema.
export const LEAD_CONDITION_CONFIG = {
  fields: LEAD_FILTER_FIELDS,
  opsByField: OPS_BY_LEAD_FIELD,
  numericFields: ["value"],
  arrayFields: LEAD_ARRAY_FIELDS,
} as const;
