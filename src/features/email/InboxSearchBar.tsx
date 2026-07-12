"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { INBOX_SEARCH_DEBOUNCE_MS } from "@/constants/email";
import { STRINGS } from "@/constants/strings";

interface InboxSearchBarProps {
  onQuery: (q: string) => void;
}

// Debounced free-text search for the Inbox list. A2 (Pipedrive parity): collapsed to a search icon
// by default and expanded to an input on activation, rather than a persistent full-width field.
// Clearing the input fires onQuery("") immediately (no debounce) so the caller snaps back to the
// folder view without delay; blurring an empty input collapses back to the icon.
export function InboxSearchBar({ onQuery }: InboxSearchBarProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  // Focus the input the moment it appears so the user can type immediately after clicking the icon.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  function handleChange(next: string): void {
    setValue(next);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    if (next.trim() === "") {
      onQuery("");
      return;
    }
    timeoutRef.current = setTimeout(() => onQuery(next), INBOX_SEARCH_DEBOUNCE_MS);
  }

  function handleBlur(): void {
    // Collapse back to the icon only when the field is empty, so an active query stays visible.
    if (value.trim() === "") setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label={STRINGS.inbox.searchLabel}
        onClick={() => setExpanded(true)}
        className="inline-flex items-center rounded border bg-background p-1.5 text-muted-foreground outline-none hover:text-foreground focus:ring-1 focus:ring-ring"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="search"
      aria-label={STRINGS.inbox.searchLabel}
      placeholder={STRINGS.inbox.searchPlaceholder}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className="w-full rounded border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
