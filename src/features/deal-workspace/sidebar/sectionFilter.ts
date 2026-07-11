"use client";
import { createContext, useContext } from "react";

// When true, FieldRows whose value is empty render nothing. Provided by CollapsibleSection's
// "hide empty fields" (funnel) toggle; defaults to false so a bare FieldRow always shows.
export const HideEmptyContext = createContext(false);

export function useHideEmpty(): boolean {
  return useContext(HideEmptyContext);
}
