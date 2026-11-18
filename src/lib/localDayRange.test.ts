import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { LEGACY_TIME_ZONE_PRIMARY } from "@/constants/legacyTimeZones";
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

  it.each([
    ["US/Eastern", "America/New_York"],
    ["US/Pacific", "America/Los_Angeles"],
    ["GB", "Europe/London"],
    ["Asia/Ujung_Pandang", "Asia/Makassar"],
    ["Europe/Zaporozhye", "Europe/Kyiv"],
    ["Canada/Pacific", "America/Vancouver"],
    ["Zulu", "Etc/UTC"],
    ["america/buenos_aires", "America/Argentina/Buenos_Aires"],
    ["ASIA/CALCUTTA", "Asia/Kolkata"],
  ])("maps the tz backward link %s to %s whatever its case", (legacy, primary) => {
    expect(resolveTimeZone(legacy)).toBe(primary);
  });

  it("leaves every zone that is not a legacy link exactly as given", () => {
    const legacy = new Set(Object.keys(LEGACY_TIME_ZONE_PRIMARY));
    const canonical = [
      ...Intl.supportedValuesOf("timeZone").filter((zone) => !legacy.has(zone)),
      "UTC",
      "Etc/UTC",
      "Etc/GMT+3",
      "Africa/Asmara",
      "Europe/Amsterdam",
    ];
    expect(canonical.filter((zone) => resolveTimeZone(zone) !== zone)).toEqual([]);
  });

  it("maps every legacy link to a zone that is not itself a legacy link", () => {
    const targets = Object.values(LEGACY_TIME_ZONE_PRIMARY);
    expect(targets.filter((zone) => zone in LEGACY_TIME_ZONE_PRIMARY)).toEqual([]);
    expect(targets.filter((zone) => resolveTimeZone(zone) !== zone)).toEqual([]);
  });

  it("falls back to UTC for a missing or unknown zone", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
    expect(resolveTimeZone("Mars/Olympus")).toBe("UTC");
    expect(resolveTimeZone(NY)).toBe(NY);
  });
});
