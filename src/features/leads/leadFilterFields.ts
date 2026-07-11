// Zod-free field/operator allow-list for the Leads Inbox inline filter builder. Kept separate
// from leads/schemas.ts (which imports zod) so the client filter builder can import these
// constants without pulling zod (~62 KB gzipped) into the /leads bundle. leads/schemas.ts
// re-exports these and re-validates on the server, so the client dropdown and the server
// allow-list stay in lockstep.

export const LEAD_FILTER_FIELDS = ["title", "value", "sourceOrigin", "ownerId"] as const;
export type LeadFilterField = (typeof LEAD_FILTER_FIELDS)[number];
export const LEAD_FILTER_OPS = ["eq", "neq", "gt", "lt", "gte", "lte", "contains"] as const;

// Which operators each lead field's column type can run (mirrors the server leadFilter allow-list).
// Client-safe so the inline builder can restrict its op dropdown to valid pairings.
const LEAD_TEXT_OPS = ["contains", "eq", "neq"] as const;
const LEAD_ORDERED_OPS = ["eq", "neq", "gt", "lt", "gte", "lte"] as const;
const LEAD_EXACT_OPS = ["eq", "neq"] as const;
export const OPS_BY_LEAD_FIELD: Record<LeadFilterField, readonly string[]> = {
  title: LEAD_TEXT_OPS,
  value: LEAD_ORDERED_OPS,
  sourceOrigin: LEAD_TEXT_OPS,
  ownerId: LEAD_EXACT_OPS,
};
