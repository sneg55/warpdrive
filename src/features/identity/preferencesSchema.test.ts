import { expect, it } from "vitest";
import {
  leadsViewSchema,
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

it("rejects a non-boolean Interface flag", () => {
  expect(uiSchema.safeParse({ winSound: "yes" }).success).toBe(false);
});

it("rejects an openDetailsAfterCreate missing an entity key", () => {
  expect(uiSchema.safeParse({ openDetailsAfterCreate: { leadDeal: true } }).success).toBe(false);
});

it("uiFlagInputSchema accepts a whitelisted key and rejects an unknown one", () => {
  expect(uiFlagInputSchema.safeParse({ key: "winSound", value: true }).success).toBe(true);
  expect(uiFlagInputSchema.safeParse({ key: "dropTable", value: true }).success).toBe(false);
});
