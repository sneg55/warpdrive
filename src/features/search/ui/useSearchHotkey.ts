"use client";
import { useEffect } from "react";
import { isTypingTarget } from "@/features/shortcuts/shortcutTarget";

export function useSearchHotkey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const isSlash = e.key === "/" && !meta && !isTypingTarget(e.target);
      if ((meta && e.key.toLowerCase() === "k") || isSlash) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
