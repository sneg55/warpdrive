import { describe, expect, it } from "vitest";
import { withLoggedTestDb } from "@/db/testing/queryLog";
import { sqlTimeZone } from "./sqlTimeZone";

describe("sqlTimeZone", () => {
  it("canonicalizes a legacy link and keeps a zone this Postgres knows", async () => {
    await withLoggedTestDb(async (db) => {
      const signal = new AbortController().signal;
      expect(await sqlTimeZone(db, "US/Eastern", signal)).toBe("America/New_York");
      expect(await sqlTimeZone(db, "Asia/Tokyo", signal)).toBe("Asia/Tokyo");
    });
  });

  it("falls back to UTC for a zone Intl accepts but this Postgres does not", async () => {
    await withLoggedTestDb(async (db) => {
      const signal = new AbortController().signal;
      expect(await sqlTimeZone(db, "US/Pacific-New", signal)).toBe("UTC");
    });
  });

  it("reads the zone list from Postgres once per db, not once per call", async () => {
    await withLoggedTestDb(async (db, _params, queries) => {
      const signal = new AbortController().signal;
      await sqlTimeZone(db, "Asia/Tokyo", signal);
      await sqlTimeZone(db, "Europe/Paris", signal);
      expect(queries.filter((q) => q.includes("pg_timezone_names"))).toHaveLength(1);
    });
  });
});
