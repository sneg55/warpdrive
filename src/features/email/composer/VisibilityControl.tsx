"use client";

// VisibilityControl (C1): interactive composer privacy picker. A shadcn DropdownMenu (never a
// native <select>) offering Private / Shared. The chosen value is lifted into composer state and
// threaded into the send payload (useComposerSend -> sendEmailInput.visibility) so the sent thread
// lands with the visibility the author picked. Private = closed padlock; shared = open padlock.

import { Lock, LockOpen } from "lucide-react";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INLINE_CONTROL_SURFACE } from "@/components/ui/inlineControlSurface";
import { cn } from "@/lib/utils";
import type { EmailVisibility } from "../threadVisibility";
import { COMPOSER_STRINGS } from "./composer.constants";

interface VisibilityControlProps {
  value: EmailVisibility;
  onChange: (value: EmailVisibility) => void;
}

// Closed padlock (private) or open padlock (shared), matching the ThreadPrivacyToggle glyph so the
// compose and reader controls read as the same affordance.
function LockGlyph({ open }: { open: boolean }): React.ReactNode {
  const Glyph = open ? LockOpen : Lock;
  return <Glyph aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />;
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
        className={cn(
          INLINE_CONTROL_SURFACE,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
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
