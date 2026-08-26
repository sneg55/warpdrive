// SQL-shape tests for the Tier 2 operators, split out of filterAst.test.ts to keep that file
// under the size cap. The null-safe parenthesised forms and the bound parameters are the whole
// point of these operators, so assert the emitted SQL text and params, not just row counts.
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { filterToSql } from "./filterAst";
import type { FilterDefinition } from "./schemas";

type Condition = FilterDefinition["conditions"][number];

const dialect = new PgDialect();
function emit(c: Condition) {
  return dialect.sqlToQuery(filterToSql({ conditions: [c] }));
}

describe("filterToSql: Tier 2 operator SQL", () => {
  it("startsWith anchors the pattern with a bound value", () => {
    const q = emit({ field: "title", op: "startsWith", value: "Al" });
    expect(q.sql).toBe(`d.title ILIKE $1 || '%'`);
    expect(q.params).toEqual(["Al"]);
  });

  // A bare NOT ILIKE is NULL for a null column, so it would drop exactly the rows that most
  // obviously "do not contain" the term.
  it("notContains keeps null columns and binds the value", () => {
    const q = emit({ field: "orgName", op: "notContains", value: "acme" });
    expect(q.sql).toBe(`(o.name IS NULL OR o.name NOT ILIKE '%' || $1 || '%')`);
    expect(q.params).toEqual(["acme"]);
  });

  it("isEmpty takes the shape of the column type and binds nothing", () => {
    expect(emit({ field: "title", op: "isEmpty" }).sql).toBe(`(d.title IS NULL OR d.title = '')`);
    expect(emit({ field: "value", op: "isEmpty" }).sql).toBe(`d.value IS NULL`);
    expect(emit({ field: "expectedCloseDate", op: "isEmpty" }).sql).toBe(
      `d.expected_close_date IS NULL`,
    );
    expect(emit({ field: "labels", op: "isEmpty" }).sql).toBe(`cardinality(d.labels) = 0`);
    expect(emit({ field: "title", op: "isEmpty" }).params).toEqual([]);
  });

  it("isNotEmpty negates the whole isEmpty expression", () => {
    expect(emit({ field: "title", op: "isNotEmpty" }).sql).toBe(
      `NOT ((d.title IS NULL OR d.title = ''))`,
    );
    expect(emit({ field: "value", op: "isNotEmpty" }).sql).toBe(`NOT (d.value IS NULL)`);
    expect(emit({ field: "labels", op: "isNotEmpty" }).sql).toBe(`NOT (cardinality(d.labels) = 0)`);
  });

  // `d.value <> $1` is NULL for a deal with no value, so "is not 5" dropped every valueless deal.
  it("neq compiles to IS DISTINCT FROM so a null column still compares", () => {
    const q = emit({ field: "value", op: "neq", value: "5" });
    expect(q.sql).toBe(`d.value IS DISTINCT FROM $1`);
    expect(q.params).toEqual(["5"]);
  });

  it("SECURITY: an injection payload stays a bound parameter for every new text op", () => {
    for (const op of ["startsWith", "notContains"] as const) {
      const q = emit({ field: "title", op, value: "'); DROP TABLE deals; --" });
      expect(q.sql).not.toContain("DROP TABLE");
      expect(q.params).toEqual(["'); DROP TABLE deals; --"]);
    }
  });

  // `value` is optional on the schema so isEmpty/isNotEmpty can omit it, which lets an internal
  // caller type-check a value-taking op with no value. node-postgres binds undefined as NULL, so
  // `title IS DISTINCT FROM NULL` would match every non-null title and the condition would silently
  // disappear while the user still sees a "filtered" list.
  it("rejects a value-taking op that arrives with no value", () => {
    const ops = ["eq", "neq", "contains", "startsWith", "notContains"] as const;
    for (const op of ops) {
      expect(() => emit({ field: "title", op })).toThrow(
        expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
      );
    }
    for (const op of ["gt", "lte"] as const) {
      expect(() => emit({ field: "value", op })).toThrow(
        expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
      );
    }
  });

  it("rejects a valueless array membership test", () => {
    for (const op of ["eq", "neq"] as const) {
      expect(() => emit({ field: "labels", op })).toThrow(
        expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
      );
    }
  });

  it("SECURITY: rejects a text-only Tier 2 op on the labels array field", () => {
    for (const op of ["startsWith", "notContains"] as const) {
      expect(() => emit({ field: "labels", op, value: "hot" })).toThrow(
        expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
      );
    }
  });
});
