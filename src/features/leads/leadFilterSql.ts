import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { LeadFilterOp } from "./leadFilter";

const OP_RAW = {
  eq: "=",
  neq: "IS DISTINCT FROM",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
} as const;

export function requireValue(
  op: LeadFilterOp,
  value: string | number | string[] | undefined,
): string | number | string[] {
  if (value === undefined) {
    throw new AppError(ERROR_IDS.LEAD_FILTER_INVALID, "Missing value for a leads filter op", {
      op,
    });
  }
  return value;
}

function requireScalar(op: LeadFilterOp, value: string | number | string[]): string | number {
  if (Array.isArray(value)) {
    throw new AppError(ERROR_IDS.LEAD_FILTER_INVALID, "List value on a scalar leads field", { op });
  }
  return value;
}

export function requireLabelValue(
  op: LeadFilterOp,
  value: string | number | string[],
): string | string[] {
  if (Array.isArray(value) && value.length === 0) {
    throw new AppError(ERROR_IDS.LEAD_FILTER_INVALID, "Empty list on a labels condition", { op });
  }
  return Array.isArray(value) ? value : String(value);
}

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

export function scalarCondition(
  colSql: SQL,
  op: LeadFilterOp,
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
