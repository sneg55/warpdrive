import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { getPreferencesForActor } from "./preferencesForActor";
import { setPreferences } from "./preferencesRepo";

// getPreferencesForActor is the React.cache-wrapped reader the (app) layout and the list pages
// share so preferences are read once per render pass instead of once per component. Outside an RSC
// request scope cache() is a pass-through, so this test can only assert behavior parity with the
// raw repo read (the dedup itself is a React.cache guarantee, exercised in the running app).
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
