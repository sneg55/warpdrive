import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { getPreferences, setPreferences } from "./preferencesRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("returns defaults when no row exists", async () => {
  const u = await seedUser(h.db);
  expect(await getPreferences(h.db, u.id, sig())).toEqual({
    timezone: null,
    density: "comfortable",
    ui: {},
  });
});

it("upserts scalars and reads them back", async () => {
  const u = await seedUser(h.db);
  await setPreferences(h.db, u.id, { timezone: "Europe/London", density: "compact" }, sig());
  const p = await getPreferences(h.db, u.id, sig());
  expect(p).toMatchObject({ timezone: "Europe/London", density: "compact" });
});

it("deep-merges ui keys instead of clobbering", async () => {
  const u = await seedUser(h.db);
  await setPreferences(h.db, u.id, { ui: { dealHeaderBlocks: ["a"] } }, sig());
  await setPreferences(
    h.db,
    u.id,
    { ui: { leadsView: { columns: ["title"], sort: { field: "createdAt", dir: "desc" } } } },
    sig(),
  );
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.ui.dealHeaderBlocks).toEqual(["a"]);
  expect(p.ui.leadsView?.columns).toEqual(["title"]);
});

it("concurrent ui writes to different keys both survive (no lost update)", async () => {
  const u = await seedUser(h.db);
  await Promise.all([
    setPreferences(h.db, u.id, { ui: { dealHeaderBlocks: ["a"] } }, sig()),
    setPreferences(
      h.db,
      u.id,
      { ui: { leadsView: { columns: ["title"], sort: { field: "createdAt", dir: "desc" } } } },
      sig(),
    ),
  ]);
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.ui.dealHeaderBlocks).toEqual(["a"]);
  expect(p.ui.leadsView?.columns).toEqual(["title"]);
});

it("a ui-only write does not reset timezone/density", async () => {
  const u = await seedUser(h.db);
  await setPreferences(h.db, u.id, { timezone: "Europe/London", density: "compact" }, sig());
  await setPreferences(h.db, u.id, { ui: { dealHeaderBlocks: ["x"] } }, sig());
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.timezone).toBe("Europe/London");
  expect(p.density).toBe("compact");
  expect(p.ui.dealHeaderBlocks).toEqual(["x"]);
});

it("round-trips the scheduleFollowUpAfterWon ui flag", async () => {
  const u = await seedUser(h.db);
  await setPreferences(h.db, u.id, { ui: { scheduleFollowUpAfterWon: true } }, sig());
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.ui.scheduleFollowUpAfterWon).toBe(true);
});

it("round-trips the board toolbar view (owner filter + sort) across a reload", async () => {
  const u = await seedUser(h.db);
  await setPreferences(
    h.db,
    u.id,
    {
      ui: {
        boardView: {
          ownerId: u.id,
          sortKey: "value",
          sortDir: "desc",
          savedFilterId: null,
          conditions: null,
        },
      },
    },
    sig(),
  );
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.ui.boardView).toMatchObject({ ownerId: u.id, sortKey: "value", sortDir: "desc" });
});

// A bag written by an older build can hold a value this build no longer accepts (here a deal
// sidebar section id that was since retired). Reading it must drop that key alone, not fall back to
// an empty bag and reset every other preference the user has set.
it("keeps the stored board view when a sibling ui key holds a retired value", async () => {
  const u = await seedUser(h.db);
  await h.db.execute(sql`
    insert into user_preferences (user_id, ui)
    values (${u.id}, ${JSON.stringify({
      dealSidebarSections: [
        { id: "summary", visible: true },
        { id: "details", visible: true },
      ],
      boardView: {
        ownerId: u.id,
        sortKey: "updateTime",
        sortDir: "desc",
        savedFilterId: null,
        conditions: null,
      },
      winSound: true,
    })}::jsonb)
  `);
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.ui.boardView).toMatchObject({ ownerId: u.id, sortKey: "updateTime" });
  expect(p.ui.winSound).toBe(true);
  expect(p.ui.dealSidebarSections).toBeUndefined();
});

it("independent Interface flag writes coexist and the nested object survives", async () => {
  const u = await seedUser(h.db);
  await setPreferences(h.db, u.id, { ui: { usPhoneFormat: true } }, sig());
  await setPreferences(h.db, u.id, { ui: { winSound: true } }, sig());
  await setPreferences(
    h.db,
    u.id,
    { ui: { openDetailsAfterCreate: { leadDeal: true, person: false, org: true } } },
    sig(),
  );
  const p = await getPreferences(h.db, u.id, sig());
  expect(p.ui.usPhoneFormat).toBe(true);
  expect(p.ui.winSound).toBe(true);
  expect(p.ui.openDetailsAfterCreate).toEqual({ leadDeal: true, person: false, org: true });
});
