"use client";

import type React from "react";
import { createContext, useContext } from "react";

const RealtimeUrlContext = createContext("");

export function RealtimeUrlProvider({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <RealtimeUrlContext.Provider value={url}>{children}</RealtimeUrlContext.Provider>;
}

export function useRealtimeUrl(): string {
  return useContext(RealtimeUrlContext);
}
