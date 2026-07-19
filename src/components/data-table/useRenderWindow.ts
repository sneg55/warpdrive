import { useState } from "react";

// Default number of rows painted per window step. Matches the SSR first-page size (50) used by
// the list pages, so the initial client paint is the same size the server already streamed.
export const RENDER_WINDOW_STEP = 50;

export interface RenderWindow<T> {
  visible: T[];
  hasMore: boolean;
  remaining: number;
  showMore: () => void;
}

// Caps how many items of a (possibly large) list are painted to the DOM, revealing more in
// fixed-size steps via showMore(). Filtering, sorting, selection, and counts stay over the full
// list upstream; only the painted slice is bounded, so this is a pure render-cost win with no
// change to data semantics. slice() clamps gracefully when the list shrinks below the window,
// so a stale large window never over-reads its data (e.g. after a filter narrows the set).
export function useRenderWindow<T>(items: readonly T[], step: number): RenderWindow<T> {
  const [count, setCount] = useState(step);
  const remaining = Math.max(0, items.length - count);
  return {
    visible: items.slice(0, count),
    hasMore: remaining > 0,
    remaining,
    showMore: () => setCount((c) => c + step),
  };
}
