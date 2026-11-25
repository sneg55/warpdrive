"use client";

import type React from "react";
import { createContext, useContext } from "react";

const BrevoEnabledContext = createContext(false);

export function BrevoEnabledProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return <BrevoEnabledContext.Provider value={enabled}>{children}</BrevoEnabledContext.Provider>;
}

export function useBrevoEnabled(): boolean {
  return useContext(BrevoEnabledContext);
}
