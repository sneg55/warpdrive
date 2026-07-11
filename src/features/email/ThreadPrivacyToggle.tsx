"use client";

import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readCsrfToken } from "@/utils/csrfCookie";
import { setThreadVisibilityAction } from "./threadVisibilityActions";

// A closed padlock (private) or an open one (shared). Inline SVG matches the row's other icons
// (no icon-lib dependency for a single glyph) and swaps only the shackle path on state.
function LockGlyph({ open }: { open: boolean }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      {open ? <path d="M8 11V7a4 4 0 0 1 7.5-1.9" /> : <path d="M8 11V7a4 4 0 0 1 8 0v4" />}
    </svg>
  );
}

// Owner-only per-row privacy switch (P5). Private = closed lock; the DropdownMenu offers
// Private/Shared. Only the mailbox owner mounts this (ThreadRow gates on thread.isOwner), and the
// server re-checks ownership, so this is an affordance, not the security boundary.
export function ThreadPrivacyToggle({
  threadId,
  visibility,
  onChanged,
}: {
  threadId: string;
  visibility: string;
  onChanged?: () => void;
}): React.ReactNode {
  const [busy, setBusy] = useState(false);
  const reportError = useActionError();
  const isPrivate = visibility === "private";

  async function set(next: "private" | "shared"): Promise<void> {
    if (next === visibility) return;
    setBusy(true);
    const res = await setThreadVisibilityAction(readCsrfToken(), { threadId, visibility: next });
    setBusy(false);
    if (res.ok) onChanged?.();
    else reportError(res.error.id);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={isPrivate ? "Private conversation" : "Shared conversation"}
        disabled={busy}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex rounded p-1 text-muted-foreground transition-transform hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <LockGlyph open={!isPrivate} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => void set("private")}>Private</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void set("shared")}>Shared</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
