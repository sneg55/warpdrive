import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { readBaseCurrency } from "./readBaseCurrency";

const sig = () => new AbortController().signal;

describe("readBaseCurrency", () => {
  it("falls back to USD when the settings singleton is absent", async () => {
    await withTestDb(async (db) => {
      expect(await readBaseCurrency(db, sig())).toBe("USD");
    });
  });

  it("returns the configured base currency", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({ id: true, baseCurrency: "EUR" });
      expect(await readBaseCurrency(db, sig())).toBe("EUR");
    });
  });
});
