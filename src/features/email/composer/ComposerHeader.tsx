"use client";
import Link from "next/link";
import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { COMPOSER_STRINGS } from "./composer.constants";

// Email-tab compose header: Settings cog (links to email settings) + Close.
// Automation is intentionally omitted (out of scope project-wide).
export function ComposerHeader({ onClose }: { onClose?: () => void }): React.ReactNode {
  return (
    <div className="flex items-center justify-end gap-1 pb-1">
      <Tip label={COMPOSER_STRINGS.headerSettingsLabel}>
        <Link
          href="/settings/email"
          aria-label={COMPOSER_STRINGS.headerSettingsLabel}
          className="rounded p-1 text-muted-foreground transition-[transform,background-color,color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
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
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </Tip>
      )}
    </div>
  );
}
