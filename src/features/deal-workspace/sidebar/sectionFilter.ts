"use client";
import { createContext, useContext } from "react";

export const HideEmptyContext = createContext(false);

export function useHideEmpty(): boolean {
  return useContext(HideEmptyContext);
}
