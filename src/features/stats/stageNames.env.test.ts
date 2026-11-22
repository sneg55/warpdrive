import { expect, it, vi } from "vitest";

vi.stubEnv("BASE_CURRENCY", "EUR");
vi.resetModules();
const { withTestDb } = await import("@/db/testing");
const { loadDashboardConfig } = await import("./stageNames");

it("falls back to BASE_CURRENCY from the environment when the settings singleton is absent", async () => {
  await withTestDb(async (db) => {
    const config = await loadDashboardConfig(db, new AbortController().signal);
    expect(config.currency).toBe("EUR");
  });
});
