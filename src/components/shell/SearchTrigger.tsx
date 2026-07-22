"use client";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import { OPEN_SEARCH_EVENT } from "@/features/search/ui/events";

// SearchTrigger: looks like the static search input but dispatches the named
// custom event on click. Fully decoupled from CommandPalette (no shared state).
export function SearchTrigger() {
  return (
    <Button
      variant="outline"
      static
      aria-label="Open search"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
      className="w-full max-w-md justify-start bg-background text-left font-normal text-muted-foreground"
    >
      {STRINGS.search.placeholder}
    </Button>
  );
}
