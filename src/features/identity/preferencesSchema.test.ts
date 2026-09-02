import { expect, it } from "vitest";
import { MAX_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";
import {
  boardViewSchema,
  dailyActivityTargetSchema,
  leadsViewSchema,
  openDetailsAfterCreateSchema,
  PREFERENCES_DEFAULT,
  profilePrefsSchema,
  uiFlagInputSchema,
  uiSchema,
} from "./preferencesSchema";

it("defaults density to comfortable and timezone to null", () => {
  expect(PREFERENCES_DEFAULT).toEqual({ timezone: null, density: "comfortable", ui: {} });
});

it("rejects an unknown density", () => {
  expect(profilePrefsSchema.safeParse({ timezone: null, density: "cozy" }).success).toBe(false);
});

it("parses a leads view config", () => {
  const r = leadsViewSchema.parse({
    columns: ["title"],
    sort: { field: "createdAt", dir: "desc" },
  });
  expect(r.sort.dir).toBe("desc");
});

it("uiSchema drops nothing valid and treats keys as optional", () => {
  expect(uiSchema.parse({}).dealHeaderBlocks).toBeUndefined();
  expect(uiSchema.parse({ dealHeaderBlocks: ["a"] }).dealHeaderBlocks).toEqual(["a"]);
});

it("defaults every Interface flag to undefined (off) when absent", () => {
  const ui = uiSchema.parse({});
  expect(ui.usPhoneFormat).toBeUndefined();
  expect(ui.winSound).toBeUndefined();
  expect(ui.emailLinksNewTab).toBeUndefined();
  expect(ui.prefillParticipantsAsRecipients).toBeUndefined();
  expect(ui.autoPrefixLeadDealTitles).toBeUndefined();
  expect(ui.openDetailsAfterCreate).toBeUndefined();
});

it("round-trips the five boolean Interface flags", () => {
  const ui = uiSchema.parse({
    usPhoneFormat: true,
    winSound: true,
    emailLinksNewTab: true,
    prefillParticipantsAsRecipients: false,
    autoPrefixLeadDealTitles: true,
  });
  expect(ui.usPhoneFormat).toBe(true);
  expect(ui.winSound).toBe(true);
  expect(ui.emailLinksNewTab).toBe(true);
  expect(ui.prefillParticipantsAsRecipients).toBe(false);
  expect(ui.autoPrefixLeadDealTitles).toBe(true);
});

it("parses the per-entity openDetailsAfterCreate object", () => {
  const ui = uiSchema.parse({
    openDetailsAfterCreate: { leadDeal: true, person: false, org: true },
  });
  expect(ui.openDetailsAfterCreate).toEqual({ leadDeal: true, person: false, org: true });
});

// The write boundary rejects a bad value; the read schema drops that one key and keeps the rest.
it("rejects a non-boolean Interface flag on write and drops it on read", () => {
  expect(uiFlagInputSchema.safeParse({ key: "winSound", value: "yes" }).success).toBe(false);
  const ui = uiSchema.parse({ winSound: "yes", emailLinksNewTab: true });
  expect(ui.winSound).toBeUndefined();
  expect(ui.emailLinksNewTab).toBe(true);
});

it("rejects an openDetailsAfterCreate missing an entity key on write and drops it on read", () => {
  expect(openDetailsAfterCreateSchema.safeParse({ leadDeal: true }).success).toBe(false);
  const ui = uiSchema.parse({ openDetailsAfterCreate: { leadDeal: true }, winSound: true });
  expect(ui.openDetailsAfterCreate).toBeUndefined();
  expect(ui.winSound).toBe(true);
});

it("uiFlagInputSchema accepts a whitelisted key and rejects an unknown one", () => {
  expect(uiFlagInputSchema.safeParse({ key: "winSound", value: true }).success).toBe(true);
  expect(uiFlagInputSchema.safeParse({ key: "dropTable", value: true }).success).toBe(false);
});

it("stores scheduleFollowUpAfterDone as a generic Interface flag", () => {
  expect(
    uiFlagInputSchema.safeParse({ key: "scheduleFollowUpAfterDone", value: true }).success,
  ).toBe(true);
  expect(uiSchema.parse({}).scheduleFollowUpAfterDone).toBeUndefined();
  expect(uiSchema.parse({ scheduleFollowUpAfterDone: true }).scheduleFollowUpAfterDone).toBe(true);
  expect(uiSchema.parse({ scheduleFollowUpAfterDone: "yes" }).scheduleFollowUpAfterDone).toBe(
    undefined,
  );
});

it("parses a persisted board view (owner, sort, saved filter, ad-hoc conditions)", () => {
  const ui = uiSchema.parse({
    boardView: {
      ownerId: "22222222-2222-4222-8222-222222222222",
      sortKey: "title",
      sortDir: "desc",
      savedFilterId: "33333333-3333-4333-8333-333333333333",
      conditions: { conditions: [{ field: "value", op: "gt", value: 100 }] },
    },
  });
  expect(ui.boardView).toMatchObject({
    ownerId: "22222222-2222-4222-8222-222222222222",
    sortKey: "title",
    sortDir: "desc",
    savedFilterId: "33333333-3333-4333-8333-333333333333",
    conditions: { conditions: [{ field: "value", op: "gt", value: 100 }] },
  });
});

it("rejects a board view sort key the board cannot render", () => {
  expect(boardViewSchema.safeParse({ sortKey: "salary", sortDir: "asc" }).success).toBe(false);
});

it("drops an unparseable stored board view without losing sibling ui prefs", () => {
  const ui = uiSchema.parse({ boardView: { sortKey: "salary" }, winSound: true });
  expect(ui.boardView).toBeUndefined();
  expect(ui.winSound).toBe(true);
});

// Prod stored a dealSidebarSections entry with a retired id ("details"). That one stale value failed
// the whole ui parse, and getPreferences falls back to {} on failure, so every sibling preference,
// the board view among them, silently reset on load.
it("keeps sibling ui prefs when a stored key holds a value the schema no longer accepts", () => {
  const ui = uiSchema.parse({
    dealSidebarSections: [
      { id: "summary", visible: true },
      { id: "details", visible: true },
    ],
    boardView: {
      ownerId: "22222222-2222-4222-8222-222222222222",
      sortKey: "updateTime",
      sortDir: "desc",
      savedFilterId: null,
      conditions: null,
    },
    winSound: true,
  });
  expect(ui.boardView?.sortKey).toBe("updateTime");
  expect(ui.winSound).toBe(true);
});

it("clamps the daily activity target to the allowed range and drops a stale value", () => {
  expect(dailyActivityTargetSchema.safeParse(3).success).toBe(true);
  expect(dailyActivityTargetSchema.safeParse(0).success).toBe(false);
  expect(dailyActivityTargetSchema.safeParse(1.5).success).toBe(false);
  expect(dailyActivityTargetSchema.safeParse(MAX_DAILY_ACTIVITY_TARGET + 1).success).toBe(false);
  expect(uiSchema.parse({}).dailyActivityTarget).toBeUndefined();
  expect(uiSchema.parse({ dailyActivityTarget: 8 }).dailyActivityTarget).toBe(8);
  expect(uiSchema.parse({ dailyActivityTarget: 0 }).dailyActivityTarget).toBeUndefined();
});
