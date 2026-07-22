"use client";
import type React from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import { forwardBoundaryError } from "@/features/observability/errorForwarding";

export interface AppSegmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for every authenticated page. It renders inside (app)/layout.tsx, so the nav and
 * top bar survive: the user can go somewhere else instead of being dropped on Next's bare page.
 *
 * Note this boundary CANNOT catch a throw from (app)/layout.tsx itself, only from the pages and
 * layouts below it. Root-layout failures land in app/global-error.tsx.
 *
 * Operational failures in this codebase are Result values rather than throws, so anything arriving
 * here is a genuine bug. In production Next replaces the message with an opaque `digest`, which is
 * the only handle that ties this screen to a server log line, so we show it.
 */
export default function AppSegmentError({ error, reset }: AppSegmentErrorProps): React.ReactNode {
  useEffect(() => {
    // The server already logged this; log the client view too so a browser-only failure is visible.
    console.error(error);
    forwardBoundaryError(error, { route: window.location.pathname, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-semibold">{STRINGS.errors.boundaryTitle}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{STRINGS.errors.boundaryBody}</p>
      {error.digest !== undefined && error.digest !== "" ? (
        <p data-testid="error-digest" className="font-mono text-xs text-muted-foreground">
          {STRINGS.errors.referenceLabel} {error.digest}
        </p>
      ) : null}
      <Button onClick={reset}>{STRINGS.errors.retry}</Button>
    </div>
  );
}
