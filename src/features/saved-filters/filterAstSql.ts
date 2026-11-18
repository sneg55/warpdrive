import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";

type FieldKind = "text" | "scalar" | "array";

const FIELD_KIND: Record<string, FieldKind> = {
  status: "scalar",
  value: "scalar",
  stageId: "scalar",
  ownerId: "scalar",
  expectedCloseDate: "scalar",
  nextActivityAt: "scalar",
  lastActivityAt: "scalar",
  wonTime: "scalar",
  title: "text",
  orgName: "text",
  labels: "array",
};

const IS_EMPTY_SQL: Record<FieldKind, (col: SQL) => SQL> = {
  text: (col) => sql`(${col} IS NULL OR ${col} = '')`,
  scalar: (col) => sql`${col} IS NULL`,
  array: (col) => sql`cardinality(${col}) = 0`,
};

const OP_RAW: Record<string, string> = {
  eq: "=",
  neq: "IS DISTINCT FROM",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
} as const;

export function requireValue(
  op: string,
  value: string | number | string[] | undefined,
): string | number | string[] {
  if (value === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Missing value for a deal filter op", { op });
  }
  return value;
}

function requireScalar(op: string, value: string | number | string[]): string | number {
  if (Array.isArray(value)) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "List value on a scalar deal field", { op });
  }
  return value;
}

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
  const opStr = OP_RAW[op];
  if (opStr === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unknown filter operator", { op });
  }
  return sql`${colSql} ${sql.raw(opStr)} ${scalar}`;
}
