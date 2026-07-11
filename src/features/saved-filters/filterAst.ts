// Security-critical: compiles a FilterDefinition AST into a Drizzle SQL fragment
// for a `deals d JOIN pipelines p` query.
//
// SECURITY INVARIANTS (must hold for every change to this file):
// 1. FIELD ALLOW-LIST: column references come from a hardcoded map keyed by the
//    allowed field enum. An unknown field is rejected with AppError. Field names
//    NEVER reach SQL via interpolation.
// 2. OPERATOR ALLOW-LIST: SQL operator strings come from a hardcoded map. An
//    unknown op is rejected. Operator strings NEVER reach SQL via interpolation.
// 3. VALUES PARAMETERIZED: every value is passed through sql`${value}` (Drizzle
//    parameter binding). An injection payload in a value is a literal, not SQL.
//    The `contains` op emits `ILIKE '%' || ${value} || '%'`: the '%' wildcards are
//    constant SQL, and ${value} stays a bound parameter, so an injection payload is
//    a literal search string. A '%' inside a user value acts as a wildcard, which is
//    acceptable substring-search behavior.
// 4. NARROWS ONLY: this fragment produces a boolean AND-able predicate. It cannot
//    widen visibility; the caller is responsible for ANDing dealVisibilityClause.
import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { FilterDefinition } from "./schemas";

// FIELD ALLOW-LIST: maps the allowed field names to fixed, hardcoded SQL column
// references using the `d` alias (deals). Adding a new entry here is the only
// way to make a field usable in a filter. Unknown keys are rejected at runtime.
const COLUMN_SQL: Record<string, SQL> = {
  status: sql`d.status`,
  value: sql`d.value`,
  stageId: sql`d.stage_id`,
  ownerId: sql`d.owner_id`,
  expectedCloseDate: sql`d.expected_close_date`,
  title: sql`d.title`,
  // Organization name of the linked org. The deal board/list reads LEFT JOIN organizations o,
  // so o.name is in scope wherever this filter is applied (deals only).
  orgName: sql`o.name`,
} as const;

// OPERATOR ALLOW-LIST: maps the allowed operator names to fixed SQL operator
// strings emitted via sql.raw (constant, never user input).
const OP_RAW: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
} as const;

// filterToSql compiles a FilterDefinition into a boolean SQL fragment that can
// be ANDed into a WHERE clause over `deals d JOIN pipelines p`.
//
// Throws AppError(E_DEAL_001) for unknown fields or operators (validation at
// the boundary via Zod should prevent this in normal usage, but this function
// is also called with typed inputs and must be independently safe).
export function filterToSql(def: FilterDefinition): SQL {
  const parts = def.conditions.map((c) => {
    // SECURITY: column comes from the allow-list ONLY; c.field never reaches SQL as text.
    const colSql = COLUMN_SQL[c.field];
    if (colSql === undefined) {
      throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unknown filter field", { field: c.field });
    }

    // `contains` does not fit the `col OP value` shape. Emit a parameterized ILIKE:
    // the '%' wildcards are constant SQL, and ${c.value} is a bound parameter, so an
    // injection payload in the value is a literal search string, never SQL. A '%' inside
    // the user value acts as a wildcard, which is acceptable substring-search behavior.
    if (c.op === "contains") {
      return sql`${colSql} ILIKE '%' || ${c.value} || '%'`;
    }

    // SECURITY: operator comes from the allow-list ONLY; opStr is emitted via sql.raw.
    const opStr = OP_RAW[c.op];
    if (opStr === undefined) {
      throw new AppError(ERROR_IDS.DEAL_NOT_FOUND, "Unknown filter operator", { op: c.op });
    }
    return sql`${colSql} ${sql.raw(opStr)} ${c.value}`;
  });

  // Rotting narrowing: keep deals whose time in the current stage is past the stage's rotting_days
  // limit. Mirrors the client badge (rottingState): rotting once floor(age_days) > rotting_days,
  // i.e. at least rotting_days + 1 whole days elapsed. All SQL here is constant plus the joined
  // stages/deals columns, no user input, so it is injection-safe. Requires the caller to have
  // joined `stages s ON s.id = d.stage_id` (getBoardColumns / listDeals do).
  if (def.rotting === true) {
    parts.push(
      sql`s.rotting_days IS NOT NULL AND d.stage_entered_at IS NOT NULL AND d.stage_entered_at <= now() - (s.rotting_days + 1) * interval '1 day'`,
    );
  }

  if (parts.length === 0) {
    return sql`true`;
  }

  // Fold parts into a single AND expression. parts is non-empty (guarded above).
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return parts.slice(1).reduce((acc, part) => sql`${acc} AND ${part}`, parts[0]!);
}
