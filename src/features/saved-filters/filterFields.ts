import { ARRAY_OPS, EXACT_OPS, FILTER_OP_KEYS, ORDERED_OPS, TEXT_OPS } from "@/constants/filterOps";

export const FILTER_FIELDS = [
  "status",
  "value",
  "stageId",
  "ownerId",
  "expectedCloseDate",
  "nextActivityAt",
  "lastActivityAt",
  "wonTime",
  "title",
  "orgName",
  "labels",
] as const;

export const FILTER_OPS = FILTER_OP_KEYS;

export const SORT_DIRS = ["asc", "desc"] as const;

export const OPS_BY_FIELD: Record<(typeof FILTER_FIELDS)[number], readonly string[]> = {
  title: TEXT_OPS,
  orgName: TEXT_OPS,
  value: ORDERED_OPS,
  expectedCloseDate: ORDERED_OPS,
  nextActivityAt: ORDERED_OPS,
  lastActivityAt: ORDERED_OPS,
  wonTime: ORDERED_OPS,
  status: EXACT_OPS,
  stageId: EXACT_OPS,
  ownerId: EXACT_OPS,
  labels: ARRAY_OPS,
};

export function hasDateCondition(
  def: { conditions: readonly { field: string }[] } | null | undefined,
): boolean {
  if (def === null || def === undefined) return false;
  return def.conditions.some((c) => (DATE_FIELDS as readonly string[]).includes(c.field));
}

const DATE_FIELDS = ["expectedCloseDate", "nextActivityAt", "lastActivityAt", "wonTime"] as const;

export function hasStatusCondition(
  def: { conditions: readonly { field: string }[] } | null | undefined,
): boolean {
  if (def === null || def === undefined) return false;
  return def.conditions.some((c) => c.field === "status");
}

export const DEAL_CONDITION_CONFIG = {
  fields: FILTER_FIELDS,
  opsByField: OPS_BY_FIELD,
  numericFields: ["value"],
  dateFields: DATE_FIELDS,
  arrayFields: ["labels"],
} as const;
