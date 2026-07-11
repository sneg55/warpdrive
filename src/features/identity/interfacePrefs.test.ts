import { describe, expect, it } from "vitest";
import { interfacePrefsFromUi } from "./interfacePrefs";

describe("interfacePrefsFromUi", () => {
  it("defaults every flag to false when the ui bag is empty", () => {
    expect(interfacePrefsFromUi({})).toEqual({
      usPhoneFormat: false,
      winSound: false,
      emailLinksNewTab: false,
      prefillParticipantsAsRecipients: false,
      autoPrefixLeadDealTitles: false,
      openDetailsAfterCreate: { leadDeal: false, person: false, org: false },
    });
  });

  it("passes through stored values", () => {
    const r = interfacePrefsFromUi({
      usPhoneFormat: true,
      winSound: true,
      openDetailsAfterCreate: { leadDeal: true, person: false, org: true },
    });
    expect(r.usPhoneFormat).toBe(true);
    expect(r.winSound).toBe(true);
    expect(r.openDetailsAfterCreate).toEqual({ leadDeal: true, person: false, org: true });
  });
});
