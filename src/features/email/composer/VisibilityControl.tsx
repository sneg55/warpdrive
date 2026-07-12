"use client";

// VisibilityControl (C1): interactive composer privacy picker. A shadcn DropdownMenu (never a
// native <select>) offering Private / Shared. The chosen value is lifted into composer state and
// threaded into the send payload (useComposerSend -> sendEmailInput.visibility) so the sent thread
// lands with the visibility the author picked. Private = closed padlock; shared = open padlock.

import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EmailVisibility } from "../threadVisibility";
import { COMPOSER_STRINGS } from "./composer.constants";

interface VisibilityControlProps {
  value: EmailVisibility;
  onChange: (value: EmailVisibility) => void;
}

// Closed padlock (private) or open padlock (shared): swap only the shackle path on state, matching
// the ThreadPrivacyToggle glyph so the compose and reader controls read as the same affordance.
function LockGlyph({ open }: { open: boolean }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {open ? <path d="M7 11V7a5 5 0 0 1 9.5-1.8" /> : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
    </svg>
  );
}

export function VisibilityControl({ value, onChange }: VisibilityControlProps): React.ReactNode {
  const isPrivate = value === "private";
  const label = isPrivate
    ? COMPOSER_STRINGS.visibilityPrivateLabel
    : COMPOSER_STRINGS.visibilityLabel;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={COMPOSER_STRINGS.visibilityPickerLabel}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LockGlyph open={!isPrivate} />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem
          aria-label={COMPOSER_STRINGS.visibilityPrivateLabel}
          className="text-xs"
          onSelect={() => onChange("private")}
        >
          {COMPOSER_STRINGS.visibilityPrivateLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          aria-label={COMPOSER_STRINGS.visibilityLabel}
          className="text-xs"
          onSelect={() => onChange("shared")}
        >
          {COMPOSER_STRINGS.visibilityLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
