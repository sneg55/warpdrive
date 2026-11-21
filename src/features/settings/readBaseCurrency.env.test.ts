import { expect, it, vi } from "vitest";

vi.stubEnv("BASE_CURRENCY", "EUR");
vi.resetModules();
const { withTestDb } = await import("@/db/testing");
const { readBaseCurrency } = await import("./readBaseCurrency");

it("falls back to BASE_CURRENCY from the environment when the settings singleton is absent", async () => {
  await withTestDb(async (db) => {
    expect(await readBaseCurrency(db, new AbortController().signal)).toBe("EUR");
  });
});
