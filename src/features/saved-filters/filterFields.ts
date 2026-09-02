// Zod-free field/operator/sort allow-list for the deal saved-filter builder. Kept separate from
// saved-filters/schemas.ts (which imports zod) so the client filter builder can import these
// constants without pulling zod (~62 KB gzipped) into the deals/pipeline bundle.
// saved-filters/schemas.ts re-exports these and re-validates on the server, so the client
// dropdown and the server allow-list stay in lockstep.
import { ARRAY_OPS, EXACT_OPS, FILTER_OP_KEYS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";

export const FILTER_FIELDS = [
  "status",
  "value",
  "stageId",
  "ownerId",
  "expectedCloseDate",
  "nextActivityAt",
  "lastActivityAt",
  "title",
  "orgName",
  "labels",
] as const;

export const FILTER_OPS = FILTER_OP_KEYS;

export const SORT_DIRS = ["asc", "desc"] as const;

// Which operators each field's SQL column type can actually run. Enforced at the boundary so an
// invalid pairing (e.g. ILIKE/`contains` on the numeric value or uuid ownerId column, or an
// ordering op on an enum) is rejected instead of throwing a Postgres type error at query time,
// which would break the entire visibility-scoped board/list read.
// The classes come from @/constants/filterOps so deals, contacts, and leads share one vocabulary.
export const OPS_BY_FIELD: Record<(typeof FILTER_FIELDS)[number], readonly string[]> = {
  title: TEXT_OPS,
  orgName: TEXT_OPS,
  value: ORDERED_OPS,
  expectedCloseDate: ORDERED_OPS,
  nextActivityAt: ORDERED_OPS,
  lastActivityAt: ORDERED_OPS,
  status: EXACT_OPS,
  stageId: EXACT_OPS,
  ownerId: EXACT_OPS,
  labels: ARRAY_OPS,
};

// Column classes that need a value check beyond the op pairing: a numeric cast, a date parse, or
// text[] membership. Fed to the shared condition validator in src/schemas/filterCondition.ts.
export function hasDateCondition(
  def: { conditions: readonly { field: string }[] } | null | undefined,
): boolean {
  if (def === null || def === undefined) return false;
  return def.conditions.some((c) => (DATE_FIELDS as readonly string[]).includes(c.field));
}

const DATE_FIELDS = ["expectedCloseDate", "nextActivityAt", "lastActivityAt"] as const;

export const DEAL_CONDITION_CONFIG = {
  fields: FILTER_FIELDS,
  opsByField: OPS_BY_FIELD,
  numericFields: ["value"],
  dateFields: DATE_FIELDS,
  arrayFields: ["labels"],
} as const;
