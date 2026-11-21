import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

vi.stubEnv("BASE_CURRENCY", "EUR");
vi.resetModules();
const { withTestDb } = await import("@/db/testing");
const { settings } = await import("@/db/schema/system");
const { ensureSeedData } = await import("./seed");

it("bootstraps the settings singleton with the configured base currency", async () => {
  await withTestDb(async (db) => {
    await db.transaction(async (tx) => {
      await ensureSeedData(tx, new AbortController().signal);
    });
    const [row] = await db.select().from(settings).where(eq(settings.id, true));
    expect(row?.baseCurrency).toBe("EUR");
  });
});
