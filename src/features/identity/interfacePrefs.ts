import type { InterfacePrefs } from "./InterfacePrefsProvider";
import type { UiPrefs } from "./preferencesSchema";

export function interfacePrefsFromUi(ui: UiPrefs): InterfacePrefs {
  return {
    usPhoneFormat: ui.usPhoneFormat ?? false,
    winSound: ui.winSound ?? false,
    emailLinksNewTab: ui.emailLinksNewTab ?? false,
    prefillParticipantsAsRecipients: ui.prefillParticipantsAsRecipients ?? false,
    autoPrefixLeadDealTitles: ui.autoPrefixLeadDealTitles ?? false,
    scheduleFollowUpAfterDone: ui.scheduleFollowUpAfterDone ?? false,
    openDetailsAfterCreate: ui.openDetailsAfterCreate ?? {
      leadDeal: false,
      person: false,
      org: false,
    },
  };
}
