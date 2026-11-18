"use client";
import type React from "react";
import { createContext, useContext } from "react";
import type { OpenDetailsAfterCreate } from "./preferencesSchema";

export interface InterfacePrefs {
  usPhoneFormat: boolean;
  winSound: boolean;
  emailLinksNewTab: boolean;
  prefillParticipantsAsRecipients: boolean;
  autoPrefixLeadDealTitles: boolean;
  scheduleFollowUpAfterDone: boolean;
  openDetailsAfterCreate: OpenDetailsAfterCreate;
}

export const INTERFACE_PREFS_DEFAULT: InterfacePrefs = {
  usPhoneFormat: false,
  winSound: false,
  emailLinksNewTab: false,
  prefillParticipantsAsRecipients: false,
  autoPrefixLeadDealTitles: false,
  scheduleFollowUpAfterDone: false,
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
