import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import {
  compileLeadFilter,
  LEAD_FILTER_CONFIG,
  type LeadFilterOp,
  leadFilterSchema,
} from "./leadFilter";

const dialect = new PgDialect();
function render(frag: SQL | null): { sql: string; params: unknown[] } {
  if (frag === null) throw new Error("expected a compiled fragment, got null");
  const q = dialect.sqlToQuery(frag);
  return { sql: q.sql, params: q.params };
}

describe("compileLeadFilter on the labels array column", () => {
  it("compiles eq to a case-insensitive membership test with the value still bound", () => {
    const q = render(
      compileLeadFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "eq", value: "hot" }] },
        LEAD_FILTER_CONFIG,
      ),
    );
    expect(q.sql).toBe(
      `(EXISTS (SELECT 1 FROM unnest("leads"."labels") AS t(v) WHERE lower(t.v) = lower($1)))`,
    );
    expect(q.params).toEqual(["hot"]);
  });

  it("compiles neq to a negated membership test, not a scalar comparison", () => {
    const q = render(
      compileLeadFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "neq", value: "cold" }] },
        LEAD_FILTER_CONFIG,
      ),
    );
    expect(q.sql).toBe(
      `(NOT EXISTS (SELECT 1 FROM unnest("leads"."labels") AS t(v) WHERE lower(t.v) = lower($1)))`,
    );
    expect(q.params).toEqual(["cold"]);
  });

  it("rejects contains on labels", () => {
    expect(() =>
      compileLeadFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "contains", value: "hot" }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
  });

  it("throws AppError for a non-array op on labels even if the config allows it", () => {
    const tampered = {
      ...LEAD_FILTER_CONFIG,
      opsByField: { ...LEAD_FILTER_CONFIG.opsByField, labels: ["gt"] },
    };
    expect(() =>
      compileLeadFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "gt", value: "hot" }] },
        tampered,
      ),
    ).toThrow(AppError);
  });
});

describe("compileLeadFilter", () => {
  it("returns null for an empty condition set", () => {
    expect(compileLeadFilter({ combinator: "and", conditions: [] }, LEAD_FILTER_CONFIG)).toBeNull();
  });

  it("compiles a title-contains condition into a SQL fragment", () => {
    const frag = compileLeadFilter(
      { combinator: "and", conditions: [{ field: "title", op: "contains", value: "acme" }] },
      LEAD_FILTER_CONFIG,
    );
    expect(frag).not.toBeNull();
  });

  it("throws AppError for a field/op pairing outside the allow-list", () => {
    expect(() =>
      compileLeadFilter(
        // contains is not allowed on the numeric value column.
        { combinator: "and", conditions: [{ field: "value", op: "contains", value: "5" }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
  });

  it("throws AppError for an unknown field", () => {
    expect(() =>
      compileLeadFilter(
        { combinator: "and", conditions: [{ field: "bogus", op: "eq", value: "x" }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
  });
});

function lead(field: string, op: LeadFilterOp, value?: string | number) {
  return render(
    compileLeadFilter(
      { combinator: "and", conditions: [{ field, op, value }] },
      LEAD_FILTER_CONFIG,
    ),
  );
}

describe("compileLeadFilter operator depth (tier 2)", () => {
  // A lead with no value must survive "value is not 5". `<>` against NULL yields NULL, which drops
  // the row; IS DISTINCT FROM treats NULL as a distinct value and keeps it.
  it("compiles neq to IS DISTINCT FROM so a NULL column is not dropped", () => {
    const q = lead("value", "neq", 5);
    expect(q.sql).toBe(`("leads"."value" IS DISTINCT FROM $1)`);
    expect(q.params).toEqual([5]);
  });

  it("compiles startsWith to a prefix ILIKE with the value bound", () => {
    const q = lead("title", "startsWith", "acme");
    expect(q.sql).toBe(`("leads"."title" ILIKE $1 || '%')`);
    expect(q.params).toEqual(["acme"]);
  });

  it("compiles notContains to a null-safe negated ILIKE with the value bound", () => {
    const q = lead("title", "notContains", "spam");
    expect(q.sql).toBe(`(("leads"."title" IS NULL OR "leads"."title" NOT ILIKE '%' || $1 || '%'))`);
    expect(q.params).toEqual(["spam"]);
  });

  it("compiles isEmpty on a text column to NULL-or-blank and isNotEmpty to its negation", () => {
    expect(lead("title", "isEmpty").sql).toBe(
      `(("leads"."title" IS NULL OR "leads"."title" = ''))`,
    );
    expect(lead("title", "isEmpty").params).toEqual([]);
    expect(lead("title", "isNotEmpty").sql).toBe(
      `(NOT ("leads"."title" IS NULL OR "leads"."title" = ''))`,
    );
  });

  it("compiles isEmpty on the numeric value column to a plain NULL test", () => {
    const q = lead("value", "isEmpty");
    expect(q.sql).toBe(`("leads"."value" IS NULL)`);
    expect(q.params).toEqual([]);
  });

  it("compiles labels isEmpty/isNotEmpty to a cardinality test", () => {
    expect(lead("labels", "isEmpty").sql).toBe(`(cardinality("leads"."labels") = 0)`);
    expect(lead("labels", "isNotEmpty").sql).toBe(`(NOT (cardinality("leads"."labels") = 0))`);
    expect(lead("labels", "isEmpty").params).toEqual([]);
  });

  // An injection payload must land as a parameter, never as SQL text.
  it("keeps a hostile value bound for every value-taking operator", () => {
    const hostile = "%' OR 1=1 --";
    for (const op of ["contains", "notContains", "startsWith", "eq", "neq"] as LeadFilterOp[]) {
      const q = lead("title", op, hostile);
      expect(q.params).toEqual([hostile]);
      expect(q.sql).not.toContain("1=1");
    }
  });
});

describe("leadFilterSchema on valueless operators", () => {
  it("accepts an isEmpty condition with no value and with an empty-string value", () => {
    expect(
      leadFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "title", op: "isEmpty" }],
      }).success,
    ).toBe(true);
    expect(
      leadFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "title", op: "isNotEmpty", value: "" }],
      }).success,
    ).toBe(true);
  });

  // value is numeric, so a valueless op must not be dragged through the numeric parse.
  it("skips the numeric-value check for a valueless op on the numeric field", () => {
    expect(
      leadFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "value", op: "isEmpty" }],
      }).success,
    ).toBe(true);
  });

  it("still requires a value for a value-taking op", () => {
    expect(
      leadFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "title", op: "contains" }],
      }).success,
    ).toBe(false);
  });

  it("rejects startsWith on an identity column that only takes eq/neq", () => {
    expect(
      leadFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "ownerId", op: "startsWith", value: "x" }],
      }).success,
    ).toBe(false);
  });
});

// "is any of": a labels condition may carry several names at once, bound as one array parameter.
describe("leadFilterSchema and compileLeadFilter with a list of label values", () => {
  const MEMBERSHIP = `EXISTS (SELECT 1 FROM unnest("leads"."labels") AS t(v) WHERE lower(t.v) = ANY(SELECT lower(x) FROM unnest($1::text[]) AS x))`;

  it("accepts a list on eq and neq and rejects one on a scalar field", () => {
    for (const op of ["eq", "neq"]) {
      expect(
        leadFilterSchema.safeParse({
          combinator: "or",
          conditions: [{ field: "labels", op, value: ["hot", "warm"] }],
        }).success,
      ).toBe(true);
    }
    expect(
      leadFilterSchema.safeParse({
        combinator: "or",
        conditions: [{ field: "title", op: "eq", value: ["a", "b"] }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty list", () => {
    expect(
      leadFilterSchema.safeParse({
        combinator: "or",
        conditions: [{ field: "labels", op: "eq", value: [] }],
      }).success,
    ).toBe(false);
  });

  it("compiles eq and neq over a list with the names in one bound array", () => {
    const eq = render(
      compileLeadFilter(
        { combinator: "or", conditions: [{ field: "labels", op: "eq", value: ["Hot", "Warm"] }] },
        LEAD_FILTER_CONFIG,
      ),
    );
    expect(eq.sql).toBe(`(${MEMBERSHIP})`);
    expect(eq.params).toEqual([["Hot", "Warm"]]);

    const neq = render(
      compileLeadFilter(
        { combinator: "or", conditions: [{ field: "labels", op: "neq", value: ["Hot", "Warm"] }] },
        LEAD_FILTER_CONFIG,
      ),
    );
    expect(neq.sql).toBe(`(NOT ${MEMBERSHIP})`);
    expect(neq.params).toEqual([["Hot", "Warm"]]);
  });

  // Zod rejects an empty list, so one arriving here means the boundary was bypassed. Compiling it
  // would produce a condition that can never match, which reads as a filter that ate every row.
  it("rejects an empty list, and a list on a scalar field, at the compiler too", () => {
    expect(() =>
      compileLeadFilter(
        { combinator: "or", conditions: [{ field: "labels", op: "eq", value: [] }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
    expect(() =>
      compileLeadFilter(
        { combinator: "or", conditions: [{ field: "title", op: "eq", value: ["a", "b"] }] },
        LEAD_FILTER_CONFIG,
      ),
    ).toThrow(AppError);
  });
});
