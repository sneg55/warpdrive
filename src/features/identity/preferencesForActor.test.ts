import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { getPreferencesForActor } from "./preferencesForActor";
import { setPreferences } from "./preferencesRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("returns defaults when no preferences row exists", async () => {
  const u = await seedUser(h.db);
  expect(await getPreferencesForActor(h.db, u.id)).toEqual({
    timezone: null,
    density: "comfortable",
    ui: {},
  });
});

it("reads back stored preferences", async () => {
  const u = await seedUser(h.db);
  await setPreferences(h.db, u.id, { timezone: "Europe/London", density: "compact" }, sig());
  expect(await getPreferencesForActor(h.db, u.id)).toMatchObject({
    timezone: "Europe/London",
    density: "compact",
  });
});
