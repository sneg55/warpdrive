"use client";
import type React from "react";

interface Props {
  label: string;
  onExpand: () => void;
  // Warm the lazily-loaded editor chunk. The editor autofocuses when it mounts, so if the chunk
  // is still in flight when the user clicks and types, the first keystrokes land nowhere.
  // Hover and keyboard focus are the earliest signals of intent.
  onPreload?: () => void;
}

// The per-tab collapsed prompt row shown under the always-visible tab strip (Pipedrive's
// "default state"): a 60px muted one-liner ("Click here to add an activity...", "Take a
// note...") that expands the active tab's editor on click. Only Activity and Notes have
// one; Email and Files render their content directly.
export function ComposeCollapsedTrigger({ label, onExpand, onPreload }: Props): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onExpand}
      onMouseEnter={onPreload}
      onFocus={onPreload}
      className="flex h-[60px] w-full items-center pl-4 text-start text-sm font-[450] text-muted-foreground"
    >
      {label}
    </button>
  );
}
