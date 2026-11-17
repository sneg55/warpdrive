import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { localDayStart, resolveTimeZone, withinLocalDays } from "./localDayRange";

const dialect = new PgDialect();
const NY = "America/New_York";

describe("localDayRange", () => {
  it("turns a local calendar day into the instant it starts in the zone", () => {
    const q = dialect.sqlToQuery(localDayStart(sql`${"2026-03-01"}::date`, NY));
    expect(q.sql).toBe("(($1::date)::timestamp AT TIME ZONE $2)");
    expect(q.params).toEqual(["2026-03-01", NY]);
  });

  it("bounds a column by an inclusive range of local days, half-open at the end", () => {
    const q = dialect.sqlToQuery(withinLocalDays(sql`d.won_time`, "2026-03-01", "2026-03-31", NY));
    expect(q.sql).toBe(
      "d.won_time >= (($1::date)::timestamp AT TIME ZONE $2) AND d.won_time < (($3::date + 1)::timestamp AT TIME ZONE $4)",
    );
    expect(q.params).toEqual(["2026-03-01", NY, "2026-03-31", NY]);
  });

  it.each([
    ["Africa/Asmera", "Africa/Nairobi"],
    ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["America/Catamarca", "America/Argentina/Catamarca"],
    ["America/Cordoba", "America/Argentina/Cordoba"],
    ["America/Godthab", "America/Nuuk"],
    ["America/Indianapolis", "America/Indiana/Indianapolis"],
    ["America/Jujuy", "America/Argentina/Jujuy"],
    ["America/Louisville", "America/Kentucky/Louisville"],
    ["America/Mendoza", "America/Argentina/Mendoza"],
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Asia/Katmandu", "Asia/Kathmandu"],
    ["Asia/Rangoon", "Asia/Yangon"],
    ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
    ["Atlantic/Faeroe", "Atlantic/Faroe"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["Pacific/Enderbury", "Pacific/Kanton"],
    ["Pacific/Ponape", "Pacific/Guadalcanal"],
    ["Pacific/Truk", "Pacific/Port_Moresby"],
  ])("maps the browser's legacy zone %s to %s, which Postgres knows without tzdata-legacy", (legacy, primary) => {
    expect(resolveTimeZone(legacy)).toBe(primary);
  });

  it("falls back to UTC for a missing or unknown zone", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
    expect(resolveTimeZone("Mars/Olympus")).toBe("UTC");
    expect(resolveTimeZone(NY)).toBe(NY);
  });
});
