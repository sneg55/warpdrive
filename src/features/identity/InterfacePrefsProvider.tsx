"use client";
import type React from "react";
import { createContext, useContext } from "react";
import type { OpenDetailsAfterCreate } from "./preferencesSchema";

// The Interface personal preferences that app-wide client components read to change display or
// create behavior (US phone formatting, email-link target, open-details-after-create, participant
// prefill, auto title nouns). Seeded server-side in the app layout from user_preferences.ui and
// exposed here so deeply-nested consumers do not have to thread props. Win-sound lives here too
// for symmetry even though only the deal page reads it.
export interface InterfacePrefs {
  usPhoneFormat: boolean;
  winSound: boolean;
  emailLinksNewTab: boolean;
  prefillParticipantsAsRecipients: boolean;
  autoPrefixLeadDealTitles: boolean;
  openDetailsAfterCreate: OpenDetailsAfterCreate;
}

// All-off default so a component rendered outside the provider (e.g. an isolated unit test) sees
// vanilla behavior rather than throwing.
export const INTERFACE_PREFS_DEFAULT: InterfacePrefs = {
  usPhoneFormat: false,
  winSound: false,
  emailLinksNewTab: false,
  prefillParticipantsAsRecipients: false,
  autoPrefixLeadDealTitles: false,
  openDetailsAfterCreate: { leadDeal: false, person: false, org: false },
};

const InterfacePrefsContext = createContext<InterfacePrefs>(INTERFACE_PREFS_DEFAULT);

export function InterfacePrefsProvider({
  value,
  children,
}: {
  value: InterfacePrefs;
  children: React.ReactNode;
}): React.ReactNode {
  return <InterfacePrefsContext.Provider value={value}>{children}</InterfacePrefsContext.Provider>;
}

export function useInterfacePrefs(): InterfacePrefs {
  return useContext(InterfacePrefsContext);
}
