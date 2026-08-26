// The per-operator SQL branches for the deal filter compiler, split out of filterAst.ts to keep
// that module at the allow-list and the compile shape. Every value here is a bound parameter and
// every operator string is a constant; see filterAst.ts for the full invariant list.
import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";

// Column kind, which decides what "empty" means: a text column is empty when NULL or '', a
// numeric or date column only when NULL, and an array column when it holds no elements.
export type FieldKind = "text" | "scalar" | "array";

export const FIELD_KIND: Record<string, FieldKind> = {
  status: "scalar",
  value: "scalar",
  stageId: "scalar",
  ownerId: "scalar",
  expectedCloseDate: "scalar",
  title: "text",
  orgName: "text",
  labels: "array",
};

const IS_EMPTY_SQL: Record<FieldKind, (col: SQL) => SQL> = {
  text: (col) => sql`(${col} IS NULL OR ${col} = '')`,
  scalar: (col) => sql`${col} IS NULL`,
  array: (col) => sql`cardinality(${col}) = 0`,
};

// OPERATOR ALLOW-LIST: maps the allowed operator names to fixed SQL operator strings emitted via
// sql.raw (constant, never user input).
// neq is IS DISTINCT FROM, not <>: `NULL <> 5` is NULL, so <> drops every row whose column is
// null instead of returning it, which is the opposite of what "is not 5" means.
const OP_RAW: Record<string, string> = {
  eq: "=",
  neq: "IS DISTINCT FROM",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
} as const;

// A value-taking op with no value can only arrive by bypassing Zod, so it is a hard reject: an
// undefined binds as SQL NULL, which would turn the condition into a silent no-op.
export function requireValue(
  op: string,
  value: string | number | string[] | undefined,
): string | number | string[] {
  if (value === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Missing value for a deal filter op", { op });
  }
  return value;
}

// A scalar column cannot take a list: drizzle expands an array into a tuple, which would bind
// `($1, $2)` where a single value belongs.
export function requireScalar(op: string, value: string | number | string[]): string | number {
  if (Array.isArray(value)) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "List value on a scalar deal field", { op });
  }
  return value;
}

// An empty list compiles to a membership test that can never match, which reads as a filter that
// silently ate every row. Zod rejects it, so one arriving here means the boundary was bypassed.
export function requireLabelValue(
  op: string,
  value: string | number | string[],
): string | string[] {
  if (Array.isArray(value) && value.length === 0) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Empty list on a deal labels condition", {
      op,
    });
  }
  return Array.isArray(value) ? value : String(value);
}

export function emptinessCondition(colSql: SQL, field: string, op: "isEmpty" | "isNotEmpty"): SQL {
  const kind = FIELD_KIND[field];
  if (kind === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unknown filter field", { field });
  }
  const empty = IS_EMPTY_SQL[kind](colSql);
  return op === "isEmpty" ? empty : sql`NOT (${empty})`;
}

// Scalar (non-array) column branch. Every ILIKE wildcard is constant SQL and every value is bound,
// so an injection payload is a literal search string. notContains carries the NULL arm explicitly:
// `NULL NOT ILIKE 'x'` is NULL, so a bare NOT ILIKE would drop the rows a user means to keep.
export function scalarCondition(
  colSql: SQL,
  op: string,
  value: string | number | string[] | undefined,
): SQL {
  const scalar = requireScalar(op, requireValue(op, value));
  if (op === "contains") return sql`${colSql} ILIKE '%' || ${String(scalar)} || '%'`;
  if (op === "startsWith") return sql`${colSql} ILIKE ${String(scalar)} || '%'`;
  if (op === "notContains") {
    return sql`(${colSql} IS NULL OR ${colSql} NOT ILIKE '%' || ${String(scalar)} || '%')`;
  }
  // SECURITY: operator comes from the allow-list ONLY; opStr is emitted via sql.raw.
  const opStr = OP_RAW[op];
  if (opStr === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unknown filter operator", { op });
  }
  return sql`${colSql} ${sql.raw(opStr)} ${scalar}`;
}
