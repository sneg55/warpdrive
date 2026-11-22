"use client";

import type React from "react";
import { createContext, useContext } from "react";
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";

const BaseCurrencyContext = createContext<string>(DEFAULT_BASE_CURRENCY);

export function BaseCurrencyProvider({
  currency,
  children,
}: {
  currency: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <BaseCurrencyContext.Provider value={currency}>{children}</BaseCurrencyContext.Provider>;
}

export function useBaseCurrency(): string {
  return useContext(BaseCurrencyContext);
}
