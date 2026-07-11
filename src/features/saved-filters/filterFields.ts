// Zod-free field/operator/sort allow-list for the deal saved-filter builder. Kept separate from
// saved-filters/schemas.ts (which imports zod) so the client filter builder can import these
// constants without pulling zod (~62 KB gzipped) into the deals/pipeline bundle.
// saved-filters/schemas.ts re-exports these and re-validates on the server, so the client
// dropdown and the server allow-list stay in lockstep.

export const FILTER_FIELDS = [
  "status",
  "value",
  "stageId",
  "ownerId",
  "expectedCloseDate",
  "title",
  "orgName",
] as const;

export const FILTER_OPS = ["eq", "neq", "gt", "lt", "gte", "lte", "contains"] as const;

export const SORT_DIRS = ["asc", "desc"] as const;

// Which operators each field's SQL column type can actually run. Enforced at the boundary so an
// invalid pairing (e.g. ILIKE/`contains` on the numeric value or uuid ownerId column, or an
// ordering op on an enum) is rejected instead of throwing a Postgres type error at query time,
// which would break the entire visibility-scoped board/list read.
const TEXT_OPS = ["eq", "neq", "contains"] as const;
const ORDERED_OPS = ["eq", "neq", "gt", "lt", "gte", "lte"] as const;
const EXACT_OPS = ["eq", "neq"] as const;
export const OPS_BY_FIELD: Record<(typeof FILTER_FIELDS)[number], readonly string[]> = {
  title: TEXT_OPS,
  orgName: TEXT_OPS,
  value: ORDERED_OPS,
  expectedCloseDate: ORDERED_OPS,
  status: EXACT_OPS,
  stageId: EXACT_OPS,
  ownerId: EXACT_OPS,
};
