"use client";
import { STRINGS } from "@/constants/strings";
import { OPEN_SEARCH_EVENT } from "@/features/search/ui/events";

// SearchTrigger: looks like the static search input but dispatches the named
// custom event on click. Fully decoupled from CommandPalette (no shared state).
export function SearchTrigger() {
  return (
    <button
      type="button"
      aria-label="Open search"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
      className="w-full max-w-md rounded-md border bg-background px-3 py-1.5 text-left text-sm text-muted-foreground"
    >
      {STRINGS.search.placeholder}
    </button>
  );
}
