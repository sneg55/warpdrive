"use client";
import { useEffect, useState } from "react";

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

export function useCooldownClock(deadlines: readonly (string | null)[]): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);

  const deadline = nextDeadline(deadlines, now);
  useEffect(() => {
    if (deadline === null) return;
    const delay = Math.max(deadline - Date.now() + 1, 0);
    const timer = setTimeout(() => setNow(new Date()), delay);
    return () => clearTimeout(timer);
  }, [deadline]);

  return now;
}
