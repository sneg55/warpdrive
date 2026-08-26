// "is any of": a People / Orgs labels condition may carry several names at once. The names stay in
// one bound array parameter, and the match stays case-insensitive for legacy lowercase values.
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import {
  compileContactFilter,
  ORG_COLUMN_SQL,
  ORG_FILTER_CONFIG,
  orgFilterSchema,
  PERSON_COLUMN_SQL,
  PERSON_FILTER_CONFIG,
  personFilterSchema,
} from "./contactFilter";

const dialect = new PgDialect();
function render(frag: SQL | null): { sql: string; params: unknown[] } {
  if (frag === null) throw new Error("expected a compiled fragment, got null");
  const q = dialect.sqlToQuery(frag);
  return { sql: q.sql, params: q.params };
}

const membership = (col: string) =>
  `EXISTS (SELECT 1 FROM unnest(${col}) AS t(v) WHERE lower(t.v) = ANY(SELECT lower(x) FROM unnest($1::text[]) AS x))`;

describe("personFilterSchema with a list of label values", () => {
  it("accepts a list on eq and neq", () => {
    for (const op of ["eq", "neq"]) {
      expect(
        personFilterSchema.safeParse({
          combinator: "or",
          conditions: [{ field: "labels", op, value: ["hot", "warm"] }],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an empty list and a list holding a blank name", () => {
    expect(
      personFilterSchema.safeParse({
        combinator: "or",
        conditions: [{ field: "labels", op: "eq", value: [] }],
      }).success,
    ).toBe(false);
    expect(
      personFilterSchema.safeParse({
        combinator: "or",
        conditions: [{ field: "labels", op: "eq", value: ["hot", " "] }],
      }).success,
    ).toBe(false);
  });

  it("rejects a list on a scalar field", () => {
    expect(
      personFilterSchema.safeParse({
        combinator: "or",
        conditions: [{ field: "name", op: "eq", value: ["a", "b"] }],
      }).success,
    ).toBe(false);
    expect(
      orgFilterSchema.safeParse({
        combinator: "or",
        conditions: [{ field: "employeeCount", op: "gt", value: ["5"] }],
      }).success,
    ).toBe(false);
  });
});

describe("compileContactFilter with a list of label values", () => {
  it("compiles eq over a list to a membership test with one bound array", () => {
    const q = render(
      compileContactFilter(
        { combinator: "or", conditions: [{ field: "labels", op: "eq", value: ["Hot", "Warm"] }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    );
    expect(q.sql).toBe(`(${membership(`"persons"."labels"`)})`);
    expect(q.params).toEqual([["Hot", "Warm"]]);
  });

  // Zod rejects an empty list, so one arriving here means the boundary was bypassed. Compiling it
  // would produce a condition that can never match, which reads as a filter that ate every row.
  it("rejects an empty list rather than compiling a condition that matches nothing", () => {
    expect(() =>
      compileContactFilter(
        { combinator: "or", conditions: [{ field: "labels", op: "eq", value: [] }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    ).toThrow(expect.objectContaining({ id: ERROR_IDS.CONTACT_FILTER_INVALID }));
  });

  it("rejects a list on a scalar field, which drizzle would expand into a tuple", () => {
    expect(() =>
      compileContactFilter(
        { combinator: "or", conditions: [{ field: "name", op: "eq", value: ["a", "b"] }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    ).toThrow(expect.objectContaining({ id: ERROR_IDS.CONTACT_FILTER_INVALID }));
  });

  it("compiles neq over a list to the negated membership test", () => {
    const q = render(
      compileContactFilter(
        { combinator: "or", conditions: [{ field: "labels", op: "neq", value: ["Hot", "Warm"] }] },
        ORG_FILTER_CONFIG,
        ORG_COLUMN_SQL,
      ),
    );
    expect(q.sql).toBe(`(NOT ${membership(`"organizations"."labels"`)})`);
    expect(q.params).toEqual([["Hot", "Warm"]]);
  });
});
