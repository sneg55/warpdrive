"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RELEASE_DISMISS_KEY } from "../constants";
import { useVersion } from "./useVersion";

// Storage access is best-effort: a blocked/absent localStorage (private mode, storage policy, SSR)
// must never throw from render or the dismiss handler, or it would take down the whole app shell.
function readDismissed(): string | null {
  try {
    return globalThis.localStorage.getItem(RELEASE_DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(version: string): void {
  try {
    globalThis.localStorage.setItem(RELEASE_DISMISS_KEY, version);
  } catch {
    // Ignore: the banner still hides via in-memory state this session.
  }
}

// App-shell banner shown to admins when a newer GitHub release exists. Dismissal is remembered
// per-version in localStorage, so a newer release re-shows it. Release notes are plain text
// (no markdown rendering) to avoid an XSS surface on GitHub-sourced content.
export function VersionBanner() {
  const { data } = useVersion();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  if (data === undefined || data.updateAvailable !== true || data.latest === null) return null;
  const { latest } = data;
  if (dismissed === latest) return null;

  const handleDismiss = (): void => {
    writeDismissed(latest);
    setDismissed(latest);
  };

  return (
    <div className="border-b bg-accent/60 px-4 py-2 text-sm text-accent-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span className="font-semibold">🎉 warpdrive {latest} is available</span>
        <span className="text-muted-foreground">(current: {data.current})</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Hide release notes" : "Show release notes"}
        >
          {expanded ? "Hide release notes" : "Show release notes"}
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {data.releaseUrl !== null && (
            <a
              href={data.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              View on GitHub →
            </a>
          )}
          <Button variant="ghost" size="icon" onClick={handleDismiss} aria-label="Dismiss">
            ×
          </Button>
        </div>
      </div>
      {expanded && data.releaseNotes !== null && (
        <div className="mx-auto mt-2 max-w-6xl whitespace-pre-wrap border-t pt-2 text-muted-foreground">
          {data.releaseNotes}
        </div>
      )}
    </div>
  );
}
