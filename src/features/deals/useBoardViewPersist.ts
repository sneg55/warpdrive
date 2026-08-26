"use client";
import { useEffect, useRef } from "react";
import { BOARD_VIEW_PERSIST_DEBOUNCE_MS } from "@/constants/boardView";
import { setBoardViewAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { type BoardViewPref, type BoardViewState, toBoardViewPref } from "./boardView";

// Best-effort, debounced persistence of the board toolbar view to user_preferences. Skips the
// initial render (the server already seeded it) and flushes a pending write on unmount so a choice
// made just before navigating away is not dropped. The effect depends on the individual view
// values, not the wrapping object, so an unrelated board re-render never schedules a write.
// A view preference is best-effort: the board keeps working on the choice in memory, so a failed
// write must not surface as an unhandled rejection.
function persist(pref: BoardViewPref): void {
  void setBoardViewAction(pref, readCsrfToken()).catch(() => {});
}

export function useBoardViewPersist(view: BoardViewState): void {
  const { ownerId, sortKey, sortDir, savedFilter, conditions } = view;
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<BoardViewPref | null>(null);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const payload = toBoardViewPref({ ownerId, sortKey, sortDir, savedFilter, conditions });
    pending.current = payload;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      persist(payload);
    }, BOARD_VIEW_PERSIST_DEBOUNCE_MS);
  }, [ownerId, sortKey, sortDir, savedFilter, conditions]);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (pending.current !== null) {
        persist(pending.current);
        pending.current = null;
      }
    };
  }, []);
}
