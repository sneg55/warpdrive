"use client";
import { useCallback, useState } from "react";
import { type DealBlockId, isDealBlockId } from "@/constants/dealBlocks";
import { setDealHeaderBlocksAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";

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
      void setDealHeaderBlocksAction({ blocks: [...next] }, readCsrfToken());
      return next;
    });
  }, []);

  const isHidden = useCallback((id: DealBlockId) => hidden.has(id), [hidden]);

  return { hidden, isHidden, toggle };
}
