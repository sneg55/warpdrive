"use client";
import type React from "react";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/formatCurrency";

interface BoardSummaryProps {
  totalValue: string;
  dealCount: number;
}

const SHOW_TOTAL_KEY = "wd.board.showTotal:v1";
// Legacy unversioned key, read once as a fallback so an existing choice survives the version bump.
const SHOW_TOTAL_KEY_LEGACY = "wd.board.showTotal";

// Pipedrive hides the total value by default and shows only the deal count, with an info button
// to reveal the total. The preference sticks per browser via localStorage. Starts hidden on the
// server render and hydrates from storage in an effect to avoid an SSR/client mismatch.
export function BoardSummary(props: BoardSummaryProps): React.ReactNode {
  const { totalValue, dealCount } = props;
  const [showTotal, setShowTotal] = useState(false);

  useEffect(() => {
    // Guarded: some environments (test jsdom) expose a partial localStorage without getItem.
    try {
      // localStorage does not exist on the server, so reading it during render would break
      // hydration. Runs once on mount; the cascading render it costs is the price of correctness.

      const stored =
        globalThis.localStorage.getItem(SHOW_TOTAL_KEY) ??
        globalThis.localStorage.getItem(SHOW_TOTAL_KEY_LEGACY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe mount read
      if (stored === "1") setShowTotal(true);
    } catch {
      // no stored preference available; stay hidden
    }
  }, []);

  function toggle(): void {
    setShowTotal((v) => {
      const next = !v;
      try {
        globalThis.localStorage.setItem(SHOW_TOTAL_KEY, next ? "1" : "0");
      } catch {
        // preference not persisted; still toggles for this session
      }
      return next;
    });
  }

  return (
    <div className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
      <span>
        {dealCount} {dealCount === 1 ? "deal" : "deals"}
      </span>
      {showTotal && (
        <span className="font-semibold text-foreground">{formatCurrency(totalValue)}</span>
      )}
      <button
        type="button"
        aria-label="Show deals total value"
        aria-pressed={showTotal}
        onClick={toggle}
        className="relative flex h-5 w-5 items-center justify-center rounded-full border text-xs text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] before:absolute before:-inset-2.5 before:content-[''] motion-reduce:transition-colors"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z" />
        </svg>
      </button>
    </div>
  );
}
