"use client";
import { useEffect, useRef } from "react";
import { BOARD_VIEW_PERSIST_DEBOUNCE_MS } from "@/constants/boardView";
import { setBoardViewAction } from "@/features/identity/preferencesActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { type BoardViewPref, type BoardViewState, toBoardViewPref } from "./boardView";

function persist(pref: BoardViewPref): void {
  void setBoardViewAction(pref, readCsrfToken()).catch(() => {});
}

export function useBoardViewPersist(view: BoardViewState, skip = false): void {
  const { ownerId, sortKey, sortDir, savedFilter, conditions } = view;
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<BoardViewPref | null>(null);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (skip) return;
    const payload = toBoardViewPref({ ownerId, sortKey, sortDir, savedFilter, conditions });
    pending.current = payload;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      persist(payload);
    }, BOARD_VIEW_PERSIST_DEBOUNCE_MS);
  }, [ownerId, sortKey, sortDir, savedFilter, conditions, skip]);

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
