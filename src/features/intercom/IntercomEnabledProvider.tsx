"use client";

import type React from "react";
import { createContext, useContext } from "react";

const IntercomEnabledContext = createContext(false);

export function IntercomEnabledProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <IntercomEnabledContext.Provider value={enabled}>{children}</IntercomEnabledContext.Provider>
  );
}

export function useIntercomEnabled(): boolean {
  return useContext(IntercomEnabledContext);
}
