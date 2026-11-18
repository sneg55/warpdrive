export const FILTER_OP_KEYS = [
  "eq",
  "neq",
  "gt",
  "lt",
  "gte",
  "lte",
  "contains",
  "notContains",
  "startsWith",
  "isEmpty",
  "isNotEmpty",
] as const;
export type FilterOpKey = (typeof FILTER_OP_KEYS)[number];

export const FILTER_OP_LABELS: Record<FilterOpKey, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

export const VALUELESS_OPS: ReadonlySet<string> = new Set(["isEmpty", "isNotEmpty"]);

export const TEXT_OPS = [
  "contains",
  "notContains",
  "startsWith",
  "eq",
  "neq",
  "isEmpty",
  "isNotEmpty",
] as const;
export const ORDERED_OPS = [
  "eq",
  "neq",
  "gt",
  "lt",
  "gte",
  "lte",
  "isEmpty",
  "isNotEmpty",
] as const;
export const EXACT_OPS = ["eq", "neq"] as const;
export const ARRAY_OPS = ["eq", "neq", "isEmpty", "isNotEmpty"] as const;
