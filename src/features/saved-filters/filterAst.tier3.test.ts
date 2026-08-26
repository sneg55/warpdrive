// Tier 3: the combinator folds the user conditions, and the rotting narrowing stays outside that
// group. Compile-shape only; the DB-side proof lives in deals/dealRepo.combinator.test.ts.
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { filterToSql } from "./filterAst";
import type { FilterDefinition } from "./schemas";

const dialect = new PgDialect();
const emit = (def: FilterDefinition) => dialect.sqlToQuery(filterToSql(def));

const TWO: FilterDefinition["conditions"] = [
  { field: "title", op: "contains", value: "acme" },
  { field: "value", op: "gt", value: 100 },
];

const ROTTING =
  `s.rotting_days IS NOT NULL AND d.stage_entered_at IS NOT NULL ` +
  `AND d.stage_entered_at <= now() - (s.rotting_days + 1) * interval '1 day'`;

describe("filterToSql combinator", () => {
  it("joins conditions with OR when the combinator is or", () => {
    const q = emit({ combinator: "or", conditions: TWO });
    expect(q.sql).toBe(`(d.title ILIKE '%' || $1 || '%' OR d.value > $2)`);
    expect(q.params).toEqual(["acme", 100]);
  });

  it("joins conditions with AND when the combinator is and", () => {
    expect(emit({ combinator: "and", conditions: TWO }).sql).toBe(
      `(d.title ILIKE '%' || $1 || '%' AND d.value > $2)`,
    );
  });

  // A definition saved before the combinator existed carries no key, and must keep meaning AND.
  it("joins with AND when the combinator key is absent", () => {
    expect(emit({ conditions: TWO }).sql).toBe(`(d.title ILIKE '%' || $1 || '%' AND d.value > $2)`);
  });

  it("leaves a single condition unwrapped", () => {
    expect(emit({ combinator: "or", conditions: [TWO[0]!] }).sql).toBe(
      `d.title ILIKE '%' || $1 || '%'`,
    );
  });
});

describe("filterToSql rotting narrowing under a combinator", () => {
  // rotting is a narrowing, not a user condition: folded into an OR group it would widen the
  // result past the narrowing and return deals that are not rotting at all.
  it("ANDs rotting outside the OR group", () => {
    expect(emit({ combinator: "or", conditions: TWO, rotting: true }).sql).toBe(
      `(d.title ILIKE '%' || $1 || '%' OR d.value > $2) AND ${ROTTING}`,
    );
  });

  it("ANDs rotting outside a single-condition group", () => {
    expect(emit({ combinator: "or", conditions: [TWO[0]!], rotting: true }).sql).toBe(
      `d.title ILIKE '%' || $1 || '%' AND ${ROTTING}`,
    );
  });

  it("compiles rotting alone with no conditions", () => {
    expect(emit({ combinator: "or", conditions: [], rotting: true }).sql).toBe(ROTTING);
  });

  it("compiles an empty definition to true", () => {
    expect(emit({ combinator: "or", conditions: [] }).sql).toBe("true");
  });
});

describe("filterToSql multi-value label conditions", () => {
  const MULTI = `EXISTS (SELECT 1 FROM unnest(d.labels) AS t(v) WHERE lower(t.v) = ANY(SELECT lower(x) FROM unnest($1::text[]) AS x))`;

  it("compiles eq over a list to a case-insensitive membership test", () => {
    const q = emit({ conditions: [{ field: "labels", op: "eq", value: ["Hot", "Warm"] }] });
    expect(q.sql).toBe(MULTI);
    // One bound array parameter, so no label name is ever interpolated into the statement.
    expect(q.params).toEqual([["Hot", "Warm"]]);
  });

  it("compiles neq over a list to the negated membership test", () => {
    const q = emit({ conditions: [{ field: "labels", op: "neq", value: ["Hot", "Warm"] }] });
    expect(q.sql).toBe(`NOT ${MULTI}`);
    expect(q.params).toEqual([["Hot", "Warm"]]);
  });

  it("SECURITY: an injection payload inside the list stays a bound literal", () => {
    const q = emit({
      conditions: [{ field: "labels", op: "eq", value: ["'); DROP TABLE deals; --"] }],
    });
    expect(q.sql).toBe(MULTI);
    expect(q.sql).not.toContain("DROP TABLE");
  });

  // Zod rejects an empty list, so one arriving here means the boundary was bypassed. Compiling it
  // would produce a condition that can never match, which reads as a filter that ate every row.
  it("rejects an empty list rather than compiling a condition that matches nothing", () => {
    expect(() => emit({ conditions: [{ field: "labels", op: "eq", value: [] }] })).toThrow(
      expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
    );
  });

  it("rejects a list on a scalar field, which drizzle would expand into a tuple", () => {
    expect(() => emit({ conditions: [{ field: "title", op: "eq", value: ["a", "b"] }] })).toThrow(
      expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
    );
  });
});
