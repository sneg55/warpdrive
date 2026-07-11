import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { settings } from "@/db/schema/system";
import { makeTestDb } from "@/test/db";
import { updateSettings } from "./settingsRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("upserts the singleton companyName and round-trips it", async () => {
  const row = await updateSettings(h.db, { companyName: "Acme Inc" }, sig());
  expect(row.companyName).toBe("Acme Inc");
  const [reread] = await h.db.select().from(settings).where(eq(settings.id, true));
  expect(reread?.companyName).toBe("Acme Inc");
});

it("updates emailTrackingDefaultEnabled without clobbering companyName", async () => {
  await updateSettings(h.db, { companyName: "Keep Me" }, sig());
  const row = await updateSettings(h.db, { emailTrackingDefaultEnabled: true }, sig());
  expect(row.emailTrackingDefaultEnabled).toBe(true);
  expect(row.companyName).toBe("Keep Me");
});

it("writes exactly one singleton row", async () => {
  await updateSettings(h.db, { companyName: "Only One" }, sig());
  const rows = await h.db.select().from(settings);
  expect(rows.length).toBe(1);
});
