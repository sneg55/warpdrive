// Security-critical: compiles a FilterDefinition AST into a Drizzle SQL fragment
// for a `deals d JOIN pipelines p` query.
//
// SECURITY INVARIANTS (must hold for every change to this file):
// 1. FIELD ALLOW-LIST: column references come from a hardcoded map keyed by the
//    allowed field enum. An unknown field is rejected with AppError. Field names
//    NEVER reach SQL via interpolation.
// 2. OPERATOR ALLOW-LIST: SQL operator strings come from a hardcoded map in
//    filterAstSql.ts. An unknown op is rejected. Operator strings NEVER reach SQL
//    via interpolation, and the combinator is picked from two constant fragments.
// 3. VALUES PARAMETERIZED: every value is passed through sql`${value}` (Drizzle
//    parameter binding). An injection payload in a value is a literal, not SQL.
//    The ILIKE ops (`contains`, `startsWith`, `notContains`) build the pattern from
//    constant '%' wildcards concatenated with the bound value, so the payload is a
//    literal search string. A '%' inside a user value acts as a wildcard, which is
//    acceptable substring-search behavior. Every value-taking branch goes through
//    requireValue: an undefined would bind as NULL and silently drop the condition.
// 4. ARRAY FIELDS: fields in ARRAY_FIELDS compile to an EXISTS over unnest of the
//    column, comparing lower(element) to the bound name, or to every name in one
//    bound text[]; every other op on them is rejected, so no operator string reaches
//    a text[] column. A list value on any other field is rejected by requireScalar,
//    since drizzle would expand it into a tuple.
// 5. NARROWS ONLY: this fragment produces a boolean AND-able predicate. It cannot
//    widen visibility; the caller is responsible for ANDing dealVisibilityClause.
//    The rotting narrowing is ANDed outside the combinator group, so an "or" filter
//    cannot widen past it.
// 6. NULL-SAFE NEGATION: `neq` uses IS DISTINCT FROM and `notContains` carries an
//    IS NULL arm, so a row with a null column is compared rather than silently
//    dropped. `isEmpty`/`isNotEmpty` bind no value at all; their shape comes from
//    the hardcoded FIELD_KIND map, never from user input.
import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { labelMembershipSql } from "@/features/labels/labelMembershipSql";
import {
  emptinessCondition,
  requireLabelValue,
  requireValue,
  scalarCondition,
} from "./filterAstSql";
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
  labels: sql`d.labels`,
} as const;

// Fields whose column is text[]: "is" / "is not" mean membership, so they take the label branch
// below instead of a scalar comparison.
const ARRAY_FIELDS: ReadonlySet<string> = new Set(["labels"]);

function conditionSql(c: FilterDefinition["conditions"][number]): SQL {
  // SECURITY: column comes from the allow-list ONLY; c.field never reaches SQL as text.
  const colSql = COLUMN_SQL[c.field];
  if (colSql === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unknown filter field", { field: c.field });
  }

  // Valueless ops run first: they compare against no value, so they must not reach any branch
  // that reads c.value, and the array kind needs cardinality rather than the membership test.
  if (c.op === "isEmpty" || c.op === "isNotEmpty") {
    return emptinessCondition(colSql, c.field, c.op);
  }

  // text[] columns: "is" / "is not" mean membership, not a scalar comparison. Checked before the
  // scalar branches so no scalar operator (ILIKE included) can reach an array column.
  if (ARRAY_FIELDS.has(c.field)) {
    const member = labelMembershipSql(colSql, requireLabelValue(c.op, requireValue(c.op, c.value)));
    if (c.op === "eq") return member;
    if (c.op === "neq") return sql`NOT ${member}`;
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unsupported operator on an array field", {
      field: c.field,
      op: c.op,
    });
  }

  return scalarCondition(colSql, c.op, c.value);
}

// filterToSql compiles a FilterDefinition into a boolean SQL fragment that can
// be ANDed into a WHERE clause over `deals d JOIN pipelines p`.
//
// Throws AppError(E_DEAL_008) for unknown fields or operators (validation at
// the boundary via Zod should prevent this in normal usage, but this function
// is also called with typed inputs and must be independently safe).
export function filterToSql(def: FilterDefinition): SQL {
  const parts = def.conditions.map(conditionSql);

  // Fold the user conditions with the combinator. A group of two or more is parenthesised so the
  // rotting AND below cannot bind tighter than an OR inside it.
  const joiner = def.combinator === "or" ? sql` OR ` : sql` AND `;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const group = parts.length === 1 ? parts[0]! : sql`(${sql.join(parts, joiner)})`;

  // Rotting narrowing: keep deals whose time in the current stage is past the stage's rotting_days
  // limit. Mirrors the client badge (rottingState): rotting once floor(age_days) > rotting_days,
  // i.e. at least rotting_days + 1 whole days elapsed. All SQL here is constant plus the joined
  // stages/deals columns, no user input, so it is injection-safe. Requires the caller to have
  // joined `stages s ON s.id = d.stage_id` (getBoardColumns / listDeals do).
  if (def.rotting === true) {
    const rotting = sql`s.rotting_days IS NOT NULL AND d.stage_entered_at IS NOT NULL AND d.stage_entered_at <= now() - (s.rotting_days + 1) * interval '1 day'`;
    // ANDed outside the group: rotting narrows the whole filter, so an "or" group must not widen
    // past it and hand back deals that are not rotting.
    return parts.length === 0 ? rotting : sql`${group} AND ${rotting}`;
  }

  return parts.length === 0 ? sql`true` : group;
}
