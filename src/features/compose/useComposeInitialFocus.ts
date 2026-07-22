"use client";

import { useEffect, useRef } from "react";

// Compose tabs mount from a tab click. Radix keeps keyboard focus on that trigger during the
// commit, so native autoFocus can run too early and be overwritten. A post-commit effect makes the
// editor's primary control the final focus target without leaving a delayed focus task behind.
export function useComposeInitialFocus<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return ref;
}
