"use client";
import { useEffect, useState } from "react";

// Timestamp of the soonest deadline still ahead of `now`, or null when none is.
function nextDeadline(deadlines: readonly (string | null)[], now: Date | null): number | null {
  if (now === null) return null;
  const current = now.getTime();
  let soonest: number | null = null;
  for (const iso of deadlines) {
    if (iso === null) continue;
    const at = new Date(iso).getTime();
    if (Number.isNaN(at) || at <= current) continue;
    if (soonest === null || at < soonest) soonest = at;
  }
  return soonest;
}

// A cooldown is read against the admin's own wall clock, so the clock waits for the browser and
// then re-reads itself the moment the soonest cooldown lapses. Null until mounted.
export function useCooldownClock(deadlines: readonly (string | null)[]): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the clock during render would differ between SSR and hydration; the mount effect is the fix, not the bug
  useEffect(() => setNow(new Date()), []);

  // The deadline, not the deadline list, is the dependency: it is stable across re-renders that
  // change nothing, and it changes whenever a deadline is added, removed, or reached.
  const deadline = nextDeadline(deadlines, now);
  useEffect(() => {
    if (deadline === null) return;
    // Timed from the live clock, not from `now`: `now` stops advancing between ticks, so a
    // deadline arriving after mount would fire late. The extra ms puts it strictly in the past.
    const delay = Math.max(deadline - Date.now() + 1, 0);
    const timer = setTimeout(() => setNow(new Date()), delay);
    return () => clearTimeout(timer);
  }, [deadline]);

  return now;
}
