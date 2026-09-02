import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { DATE_PRESET_KEYS } from "@/constants/dateFilterPresets";
import { ERROR_IDS } from "@/constants/errorIds";
import { filterToSql } from "./filterAst";
import type { FilterDefinition } from "./schemas";

type Condition = FilterDefinition["conditions"][number];

const dialect = new PgDialect();
function emit(c: Condition, timeZone?: string | null) {
  return dialect.sqlToQuery(filterToSql({ conditions: [c] }, { timeZone }));
}

const NY = "America/New_York";
const LOCAL_TODAY = "(now() AT TIME ZONE $1)::date";

describe("filterToSql: date fields compile to a half-open day range in the viewer's zone", () => {
  it("an absolute date on a timestamptz column matches that calendar day in the zone", () => {
    const q = emit({ field: "nextActivityAt", op: "eq", value: "2026-09-02" }, NY);
    expect(q.sql).toBe(
      `(d.next_activity_at >= (($1::date)::timestamp AT TIME ZONE $2) AND d.next_activity_at < (($3::date + 1)::timestamp AT TIME ZONE $4))`,
    );
    expect(q.params).toEqual(["2026-09-02", NY, "2026-09-02", NY]);
  });

  it("an absolute date on a date column compares as a plain date", () => {
    const q = emit({ field: "expectedCloseDate", op: "eq", value: "2026-09-30" }, NY);
    expect(q.sql).toBe(
      `(d.expected_close_date >= $1::date AND d.expected_close_date < $2::date + 1)`,
    );
    expect(q.params).toEqual(["2026-09-30", "2026-09-30"]);
  });

  it("maps every ordered operator onto the range bounds", () => {
    const col = "d.expected_close_date";
    const value = "2026-09-02";
    const f = "expectedCloseDate";
    expect(emit({ field: f, op: "gt", value }).sql).toBe(`${col} >= $1::date + 1`);
    expect(emit({ field: f, op: "gte", value }).sql).toBe(`${col} >= $1::date`);
    expect(emit({ field: f, op: "lt", value }).sql).toBe(`${col} < $1::date`);
    expect(emit({ field: f, op: "lte", value }).sql).toBe(`${col} < $1::date + 1`);
  });

  it("neq keeps rows with no date, like the other null-safe negations", () => {
    const q = emit({ field: "expectedCloseDate", op: "neq", value: "2026-09-02" });
    expect(q.sql).toBe(
      `(d.expected_close_date IS NULL OR d.expected_close_date < $1::date OR d.expected_close_date >= $2::date + 1)`,
    );
  });

  it("resolves a preset from the clock in the viewer's zone", () => {
    expect(emit({ field: "expectedCloseDate", op: "eq", value: "today" }, NY).sql).toBe(
      `(d.expected_close_date >= ${LOCAL_TODAY} AND d.expected_close_date < ${LOCAL_TODAY.replace("$1", "$2")} + 1)`,
    );
    expect(emit({ field: "expectedCloseDate", op: "eq", value: "this_week" }, NY).sql).toBe(
      `(d.expected_close_date >= date_trunc('week', ${LOCAL_TODAY})::date AND d.expected_close_date < date_trunc('week', ${LOCAL_TODAY.replace("$1", "$2")})::date + 7)`,
    );
    expect(emit({ field: "expectedCloseDate", op: "eq", value: "last_month" }, NY).sql).toBe(
      `(d.expected_close_date >= (date_trunc('month', ${LOCAL_TODAY}) - interval '1 month')::date AND d.expected_close_date < date_trunc('month', ${LOCAL_TODAY.replace("$1", "$2")})::date)`,
    );
    expect(emit({ field: "expectedCloseDate", op: "eq", value: "last_7_days" }, NY).sql).toBe(
      `(d.expected_close_date >= ${LOCAL_TODAY} - 6 AND d.expected_close_date < ${LOCAL_TODAY.replace("$1", "$2")} + 1)`,
    );
  });

  it("converts a preset's local day bounds to instants for a timestamptz column", () => {
    const q = emit({ field: "nextActivityAt", op: "eq", value: "today" }, NY);
    expect(q.sql).toBe(
      `(d.next_activity_at >= (((now() AT TIME ZONE $1)::date)::timestamp AT TIME ZONE $2) AND d.next_activity_at < (((now() AT TIME ZONE $3)::date + 1)::timestamp AT TIME ZONE $4))`,
    );
    expect(q.params).toEqual([NY, NY, NY, NY]);
  });

  it("falls back to UTC when the viewer has no zone or an unknown one", () => {
    expect(emit({ field: "nextActivityAt", op: "gte", value: "today" }).params).toEqual([
      "UTC",
      "UTC",
    ]);
    expect(emit({ field: "nextActivityAt", op: "gte", value: "today" }, null).params).toEqual([
      "UTC",
      "UTC",
    ]);
    expect(
      emit({ field: "nextActivityAt", op: "gte", value: "today" }, "Mars/Olympus").params,
    ).toEqual(["UTC", "UTC"]);
  });

  it("SECURITY: every preset compiles to constant SQL and binds only the zone", () => {
    for (const key of DATE_PRESET_KEYS) {
      const q = emit({ field: "nextActivityAt", op: "eq", value: key }, NY);
      expect(new Set(q.params)).toEqual(new Set([NY]));
      expect(q.sql).not.toContain(key);
      expect(q.sql).toMatch(/now\(\) AT TIME ZONE/);
    }
  });

  it("rejects a value that is neither a real calendar date nor a preset", () => {
    for (const value of ["soon", "2026-02-30", "2026-9-2"]) {
      expect(() => emit({ field: "nextActivityAt", op: "eq", value })).toThrow(
        expect.objectContaining({ id: ERROR_IDS.DEAL_FILTER_INVALID }),
      );
    }
  });

  it("isEmpty on an activity date is a plain null test", () => {
    expect(emit({ field: "nextActivityAt", op: "isEmpty" }).sql).toBe(`d.next_activity_at IS NULL`);
    expect(emit({ field: "lastActivityAt", op: "isNotEmpty" }).sql).toBe(
      `NOT (d.last_activity_at IS NULL)`,
    );
  });
});
