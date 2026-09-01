// The per-operator SQL branches for the contacts filter compiler, split out of contactFilter.ts to
// keep that module at the allow-list and compile shape. Every value here is a bound parameter and
// every operator string is a constant; see contactFilter.ts for the full invariant list.
import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { ContactFilterOp } from "./contactFilterConfig";

// neq is IS DISTINCT FROM, not <>: `NULL <> 'x'` is NULL, which would drop every row whose column
// is null from an "is not" filter.
const OP_RAW = {
  eq: "=",
  neq: "IS DISTINCT FROM",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
} as const;

// A value-taking op with no value can only arrive by bypassing Zod, so it is a hard reject.
export function requireValue(
  op: ContactFilterOp,
  value: string | number | string[] | undefined,
): string | number | string[] {
  if (value === undefined) {
    throw new AppError(ERROR_IDS.CONTACT_FILTER_INVALID, "Missing value for a contacts filter op", {
      op,
    });
  }
  return value;
}

// A scalar column cannot take a list: drizzle expands an array into a tuple, which would bind
// `($1, $2)` where a single value belongs.
function requireScalar(op: ContactFilterOp, value: string | number | string[]): string | number {
  if (Array.isArray(value)) {
    throw new AppError(ERROR_IDS.CONTACT_FILTER_INVALID, "List value on a scalar contacts field", {
      op,
    });
  }
  return value;
}

// An empty list compiles to a membership test that can never match, which reads as a filter that
// silently ate every row. Zod rejects it, so one arriving here means the boundary was bypassed.
export function requireLabelValue(
  op: ContactFilterOp,
  value: string | number | string[],
): string | string[] {
  if (Array.isArray(value) && value.length === 0) {
    throw new AppError(ERROR_IDS.CONTACT_FILTER_INVALID, "Empty list on a labels condition", {
      op,
    });
  }
  return Array.isArray(value) ? value : String(value);
}

// "Empty" depends on the column type: a text column is empty when NULL or blank, a numeric one only
// when NULL, and a text[] one when it holds no elements.
export function emptinessCondition(
  colSql: SQL,
  op: "isEmpty" | "isNotEmpty",
  kind: "text" | "numeric" | "array",
): SQL {
  if (kind === "array") {
    return op === "isEmpty"
      ? sql`cardinality(${colSql}) = 0`
      : sql`NOT (cardinality(${colSql}) = 0)`;
  }
  if (kind === "numeric") {
    return op === "isEmpty" ? sql`${colSql} IS NULL` : sql`NOT (${colSql} IS NULL)`;
  }
  return op === "isEmpty"
    ? sql`(${colSql} IS NULL OR ${colSql} = '')`
    : sql`NOT (${colSql} IS NULL OR ${colSql} = '')`;
}

// Scalar (non-array) column branch. Every ILIKE wildcard is a constant and every value is bound.
// notContains carries the NULL arm explicitly: `NULL NOT ILIKE 'x'` is NULL, so a bare NOT ILIKE
// would drop exactly the rows a user means to keep.
export function scalarCondition(
  colSql: SQL,
  op: ContactFilterOp,
  value: string | number | string[] | undefined,
  numeric: boolean,
): SQL {
  switch (op) {
    case "isEmpty":
    case "isNotEmpty":
      return emptinessCondition(colSql, op, numeric ? "numeric" : "text");
    case "contains":
      return sql`${colSql} ILIKE '%' || ${String(requireScalar(op, requireValue(op, value)))} || '%'`;
    case "notContains":
      return sql`(${colSql} IS NULL OR ${colSql} NOT ILIKE '%' || ${String(requireScalar(op, requireValue(op, value)))} || '%')`;
    case "startsWith":
      return sql`${colSql} ILIKE ${String(requireScalar(op, requireValue(op, value)))} || '%'`;
    case "eq":
    case "neq":
    case "gt":
    case "lt":
    case "gte":
    case "lte":
      return sql`${colSql} ${sql.raw(OP_RAW[op])} ${requireScalar(op, requireValue(op, value))}`;
  }
}
