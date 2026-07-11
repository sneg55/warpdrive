"use client";
import { useEffect, useRef } from "react";
import { setColumnViewAction } from "@/features/identity/preferencesActions";
import type { ColumnViewName } from "@/features/identity/preferencesSchema";
import { readCsrfToken } from "@/utils/csrfCookie";

const PERSIST_DEBOUNCE_MS = 500;

// Debounced persist of a list table's visible-column order to user_preferences (best-effort). Skips
// the initial mount (no write for the seeded order), and flushes a still-pending write on unmount so
// a reorder just before navigating away is saved, not dropped. Shared by deals list / people / orgs.
export function usePersistColumns(view: ColumnViewName, order: readonly string[]): void {
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string[] | null>(null);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const columns = [...order];
    pending.current = columns;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      void setColumnViewAction({ view, columns }, readCsrfToken());
    }, PERSIST_DEBOUNCE_MS);
  }, [order, view]);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (pending.current !== null) {
        void setColumnViewAction({ view, columns: pending.current }, readCsrfToken());
        pending.current = null;
      }
    };
  }, [view]);
}
