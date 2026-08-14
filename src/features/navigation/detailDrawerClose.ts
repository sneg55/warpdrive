"use client";
import { createContext, useContext } from "react";

// Set by DetailDrawer so detail content rendered inside the intercepted slide-over can dismiss it
// through the drawer's own close path (the one Escape and the scrim already use), instead of
// navigating. Detail content cannot dismiss the drawer with router.push: pushing to the list route
// is a soft navigation, and Next renders the previously active state of a parallel slot on a soft
// navigation, so the drawer stays open on a record the mutation just removed.
//
// null when the same content renders as a standalone page (deep link, hard load, refresh), where
// the interception is bypassed and there is no drawer to close.
export const DetailDrawerCloseContext = createContext<(() => void) | null>(null);

export function useDetailDrawerClose(): (() => void) | null {
  return useContext(DetailDrawerCloseContext);
}
