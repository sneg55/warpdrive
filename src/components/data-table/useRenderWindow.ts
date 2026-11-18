import { useState } from "react";

export const RENDER_WINDOW_STEP = 50;

export interface RenderWindow<T> {
  visible: T[];
  hasMore: boolean;
  remaining: number;
  showMore: () => void;
}

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
