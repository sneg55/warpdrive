// The condition-operator vocabulary shared by the deal, contact, and lead filter builders. One
// copy so a new operator reaches every entity's allow-list and every op dropdown at once.

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

// Operators that take no value. The builder hides the value control for them and the schemas skip
// their value checks, so a blank value is a complete row rather than an incomplete one.
export const VALUELESS_OPS: ReadonlySet<string> = new Set(["isEmpty", "isNotEmpty"]);

// Operator classes by column type. "contains" leads the text class so a new text condition defaults
// to substring match. EXACT_OPS covers identity columns (owner, stage, status) that are NOT NULL,
// so it omits the empty checks rather than offering a condition that can never match.
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
