"use client";
import { useSyncExternalStore } from "react";

// A minute-resolution clock as an external store. The week agenda needs the viewer's local time
// for the now-line and the today column; rendering it during SSR would bake the server's clock and
// timezone into the HTML and mismatch on hydration, so the server snapshot is null and the real
// time arrives on subscribe. One shared timer, so every reader ticks on the same edge.
const listeners = new Set<() => void>();
let nowMs: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  nowMs = Date.now();
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === null) {
    nowMs = Date.now();
    timer = setInterval(tick, 60_000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number | null {
  return nowMs;
}

function getServerSnapshot(): null {
  return null;
}

export function useLocalNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ms === null ? null : new Date(ms);
}
