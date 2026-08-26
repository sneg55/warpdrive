"use client";
import type React from "react";
import { useEffect } from "react";
import {
  DARK_CLASS,
  isDarkAppearance,
  PREFERS_DARK_QUERY,
  readAppearanceCookie,
} from "./appearance";

// Keeps "System" live app-wide: the inline no-flash script settles the theme at first paint, this
// re-settles it when the OS flips while the tab stays open. Renders nothing.
export function AppearanceSync(): React.ReactNode {
  useEffect(() => {
    if (typeof matchMedia !== "function") return undefined;
    const mq = matchMedia(PREFERS_DARK_QUERY);
    const apply = (): void => {
      const choice = readAppearanceCookie(document.cookie);
      document.documentElement.classList.toggle(DARK_CLASS, isDarkAppearance(choice, mq.matches));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
