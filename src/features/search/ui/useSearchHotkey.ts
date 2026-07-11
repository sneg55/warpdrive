"use client";
import { useEffect } from "react";

// Opens the command palette on Cmd/Ctrl+K or "/" when not focused in a text field.
export function useSearchHotkey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const inTextField =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const isSlash = e.key === "/" && !meta && !inTextField;
      if ((meta && e.key.toLowerCase() === "k") || isSlash) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
