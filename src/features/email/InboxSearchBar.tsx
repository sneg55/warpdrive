"use client";

import { useEffect, useRef, useState } from "react";
import { INBOX_SEARCH_DEBOUNCE_MS } from "@/constants/email";
import { STRINGS } from "@/constants/strings";

interface InboxSearchBarProps {
  onQuery: (q: string) => void;
}

// Debounced free-text search box for the Inbox list. Clearing the input fires onQuery("")
// immediately (no debounce) so the caller can snap back to the folder view without delay.
export function InboxSearchBar({ onQuery }: InboxSearchBarProps): React.ReactNode {
  const [value, setValue] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function handleChange(next: string): void {
    setValue(next);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    if (next.trim() === "") {
      onQuery("");
      return;
    }
    timeoutRef.current = setTimeout(() => onQuery(next), INBOX_SEARCH_DEBOUNCE_MS);
  }

  return (
    <input
      type="search"
      aria-label={STRINGS.inbox.searchLabel}
      placeholder={STRINGS.inbox.searchPlaceholder}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full rounded border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
