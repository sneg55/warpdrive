import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import {
  type ContactFilterOp,
  compileContactFilter,
  ORG_COLUMN_SQL,
  ORG_FILTER_CONFIG,
  orgFilterSchema,
  PERSON_COLUMN_SQL,
  PERSON_FILTER_CONFIG,
  personFilterSchema,
} from "./contactFilter";

describe("contactFilter schemas (boundary validation)", () => {
  it("accepts a valid person text condition", () => {
    const r = personFilterSchema.safeParse({
      combinator: "and",
      conditions: [{ field: "name", op: "contains", value: "acme" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects contains on an exact-only person field (ownerId)", () => {
    const r = personFilterSchema.safeParse({
      combinator: "and",
      conditions: [{ field: "ownerId", op: "contains", value: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown person field", () => {
    const r = personFilterSchema.safeParse({
      combinator: "and",
      conditions: [{ field: "ssn", op: "eq", value: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("requires a numeric value for org employeeCount ordered ops", () => {
    expect(
      orgFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "employeeCount", op: "gt", value: "big" }],
      }).success,
    ).toBe(false);
    expect(
      orgFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "employeeCount", op: "gt", value: 50 }],
      }).success,
    ).toBe(true);
  });
});

describe("compileContactFilter (defense in depth)", () => {
  it("throws on a field outside the allow-list even if it slips past Zod", () => {
    expect(() =>
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "ssn", op: "eq", value: "x" }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    ).toThrow();
  });

  it("returns null for an empty condition set (no-op filter)", () => {
    expect(
      compileContactFilter(
        { combinator: "and", conditions: [] },
        ORG_FILTER_CONFIG,
        ORG_COLUMN_SQL,
      ),
    ).toBeNull();
  });
});

const dialect = new PgDialect();
function render(frag: SQL | null): { sql: string; params: unknown[] } {
  if (frag === null) throw new Error("expected a compiled fragment, got null");
  const q = dialect.sqlToQuery(frag);
  return { sql: q.sql, params: q.params };
}

describe("compileContactFilter on the labels array column", () => {
  it("accepts eq/neq on labels and rejects contains at the boundary", () => {
    expect(
      personFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "labels", op: "eq", value: "hot" }],
      }).success,
    ).toBe(true);
    expect(
      personFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "labels", op: "contains", value: "hot" }],
      }).success,
    ).toBe(false);
  });

  it("compiles eq to a case-insensitive membership test with the value still bound", () => {
    const q = render(
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "eq", value: "hot" }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    );
    expect(q.sql).toBe(
      `(EXISTS (SELECT 1 FROM unnest("persons"."labels") AS t(v) WHERE lower(t.v) = lower($1)))`,
    );
    expect(q.params).toEqual(["hot"]);
  });

  it("compiles neq to a negated membership test, not a scalar comparison", () => {
    const q = render(
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "neq", value: "cold" }] },
        ORG_FILTER_CONFIG,
        ORG_COLUMN_SQL,
      ),
    );
    expect(q.sql).toBe(
      `(NOT EXISTS (SELECT 1 FROM unnest("organizations"."labels") AS t(v) WHERE lower(t.v) = lower($1)))`,
    );
    expect(q.params).toEqual(["cold"]);
  });

  it("throws AppError for a non-array op on labels even if the config allows it", () => {
    const tampered = {
      ...PERSON_FILTER_CONFIG,
      opsByField: { ...PERSON_FILTER_CONFIG.opsByField, labels: ["gt"] },
    };
    expect(() =>
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "gt", value: "hot" }] },
        tampered,
        PERSON_COLUMN_SQL,
      ),
    ).toThrow(AppError);
  });

  it("compiles labels isEmpty/isNotEmpty to a cardinality test", () => {
    const empty = render(
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "isEmpty" }] },
        PERSON_FILTER_CONFIG,
        PERSON_COLUMN_SQL,
      ),
    );
    expect(empty.sql).toBe(`(cardinality("persons"."labels") = 0)`);
    expect(empty.params).toEqual([]);

    const notEmpty = render(
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "labels", op: "isNotEmpty" }] },
        ORG_FILTER_CONFIG,
        ORG_COLUMN_SQL,
      ),
    );
    expect(notEmpty.sql).toBe(`(NOT (cardinality("organizations"."labels") = 0))`);
    expect(notEmpty.params).toEqual([]);
  });
});

function person(op: ContactFilterOp, value?: string | number) {
  return render(
    compileContactFilter(
      { combinator: "and", conditions: [{ field: "primaryEmail", op, value }] },
      PERSON_FILTER_CONFIG,
      PERSON_COLUMN_SQL,
    ),
  );
}

describe("compileContactFilter operator depth (tier 2)", () => {
  // A person with no email must survive "email is not x". `<>` against NULL yields NULL, which
  // drops the row; IS DISTINCT FROM treats NULL as a distinct value and keeps it.
  it("compiles neq to IS DISTINCT FROM so a NULL column is not dropped", () => {
    const q = person("neq", "a@b.com");
    expect(q.sql).toBe(`("persons"."primary_email" IS DISTINCT FROM $1)`);
    expect(q.params).toEqual(["a@b.com"]);
  });

  it("compiles startsWith to a prefix ILIKE with the value bound", () => {
    const q = person("startsWith", "acme");
    expect(q.sql).toBe(`("persons"."primary_email" ILIKE $1 || '%')`);
    expect(q.params).toEqual(["acme"]);
  });

  it("compiles notContains to a null-safe negated ILIKE with the value bound", () => {
    const q = person("notContains", "spam");
    expect(q.sql).toBe(
      `(("persons"."primary_email" IS NULL OR "persons"."primary_email" NOT ILIKE '%' || $1 || '%'))`,
    );
    expect(q.params).toEqual(["spam"]);
  });

  it("compiles isEmpty on a text column to NULL-or-blank and isNotEmpty to its negation", () => {
    expect(person("isEmpty").sql).toBe(
      `(("persons"."primary_email" IS NULL OR "persons"."primary_email" = ''))`,
    );
    expect(person("isEmpty").params).toEqual([]);
    expect(person("isNotEmpty").sql).toBe(
      `(NOT ("persons"."primary_email" IS NULL OR "persons"."primary_email" = ''))`,
    );
  });

  it("compiles isEmpty on a numeric column to a plain NULL test", () => {
    const q = render(
      compileContactFilter(
        { combinator: "and", conditions: [{ field: "employeeCount", op: "isEmpty" }] },
        ORG_FILTER_CONFIG,
        ORG_COLUMN_SQL,
      ),
    );
    expect(q.sql).toBe(`("organizations"."employee_count" IS NULL)`);
    expect(q.params).toEqual([]);
  });

  // An injection payload must land as a parameter, never as SQL text.
  it("keeps a hostile value bound for every value-taking operator", () => {
    const hostile = "%' OR 1=1 --";
    for (const op of ["contains", "notContains", "startsWith", "eq", "neq"] as ContactFilterOp[]) {
      const q = person(op, hostile);
      expect(q.params).toEqual([hostile]);
      expect(q.sql).not.toContain("1=1");
    }
  });
});

describe("contactFilter schemas on valueless operators", () => {
  it("accepts an isEmpty condition with no value and with an empty-string value", () => {
    expect(
      personFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "primaryEmail", op: "isEmpty" }],
      }).success,
    ).toBe(true);
    expect(
      personFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "name", op: "isNotEmpty", value: "" }],
      }).success,
    ).toBe(true);
  });

  // employeeCount is numeric, so a valueless op must not be dragged through the numeric parse.
  it("skips the numeric-value check for a valueless op on a numeric field", () => {
    expect(
      orgFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "employeeCount", op: "isEmpty" }],
      }).success,
    ).toBe(true);
  });

  it("still requires a value for a value-taking op", () => {
    expect(
      personFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "name", op: "contains" }],
      }).success,
    ).toBe(false);
  });

  it("rejects startsWith on an identity column that only takes eq/neq", () => {
    expect(
      personFilterSchema.safeParse({
        combinator: "and",
        conditions: [{ field: "ownerId", op: "startsWith", value: "x" }],
      }).success,
    ).toBe(false);
  });
});
