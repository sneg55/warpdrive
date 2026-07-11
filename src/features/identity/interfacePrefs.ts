import type { InterfacePrefs } from "./InterfacePrefsProvider";
import type { UiPrefs } from "./preferencesSchema";

// Project the stored ui preference bag onto the fully-defaulted InterfacePrefs the client provider
// expects. Every flag defaults off when absent. Kept as a plain (non-client) module so a server
// component (the app layout) can call it without pulling the provider into the server bundle.
export function interfacePrefsFromUi(ui: UiPrefs): InterfacePrefs {
  return {
    usPhoneFormat: ui.usPhoneFormat ?? false,
    winSound: ui.winSound ?? false,
    emailLinksNewTab: ui.emailLinksNewTab ?? false,
    prefillParticipantsAsRecipients: ui.prefillParticipantsAsRecipients ?? false,
    autoPrefixLeadDealTitles: ui.autoPrefixLeadDealTitles ?? false,
    openDetailsAfterCreate: ui.openDetailsAfterCreate ?? {
      leadDeal: false,
      person: false,
      org: false,
    },
  };
}
