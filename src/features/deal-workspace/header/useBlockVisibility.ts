"use client";
import { useCallback, useState } from "react";
import { type DealBlockId, isDealBlockId } from "@/constants/dealBlocks";
import { setDealHeaderBlocksAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";

// Manages which deal blocks are hidden. Seeded from the server pref (user_preferences.ui
// .dealHeaderBlocks holds the hidden ids). Toggling persists server-side via
// setDealHeaderBlocksAction so the choice follows the user across browsers (decision 6).
export function useBlockVisibility(initialHidden: string[]): {
  hidden: Set<DealBlockId>;
  isHidden: (id: DealBlockId) => boolean;
  toggle: (id: DealBlockId) => void;
} {
  const [hidden, setHidden] = useState<Set<DealBlockId>>(
    () => new Set(initialHidden.filter(isDealBlockId)),
  );

  const toggle = useCallback((id: DealBlockId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Fire-and-forget persistence; the local state is the source of truth for this session.
      void setDealHeaderBlocksAction({ blocks: [...next] }, readCsrfToken());
      return next;
    });
  }, []);

  const isHidden = useCallback((id: DealBlockId) => hidden.has(id), [hidden]);

  return { hidden, isHidden, toggle };
}
