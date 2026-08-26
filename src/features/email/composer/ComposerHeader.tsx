"use client";
import { Settings, X } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { COMPOSER_STRINGS } from "./composer.constants";
import { FromPicker } from "./FromPicker";

// Email-tab compose header: the From row with the Settings cog (links to email settings) and Close
// right-aligned on the same line. Automation is intentionally omitted (out of scope project-wide).
// Without a fromAddress (inbox thread reply) the row carries the actions alone and no divider.
export function ComposerHeader({
  fromAddress,
  onClose,
}: {
  fromAddress?: string;
  onClose?: () => void;
}): React.ReactNode {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1",
        fromAddress !== undefined && "border-b border-border",
      )}
    >
      {fromAddress !== undefined && <FromPicker address={fromAddress} />}
      <div className="ml-auto flex items-center gap-1">
        <Tip label={COMPOSER_STRINGS.headerSettingsLabel}>
          <Link
            href="/settings/email"
            aria-label={COMPOSER_STRINGS.headerSettingsLabel}
            className="rounded p-1 text-muted-foreground transition-[transform,background-color,color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Tip>
        {/* Close only renders where the host provides a handler (email-tab compose). In the inbox
          thread-reply composer there is nothing to close, so we omit it rather than ship a no-op. */}
        {onClose !== undefined && (
          <Tip label={COMPOSER_STRINGS.headerCloseLabel}>
            <button
              type="button"
              aria-label={COMPOSER_STRINGS.headerCloseLabel}
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-[transform,background-color,color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );
}
