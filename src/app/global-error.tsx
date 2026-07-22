"use client";
import type React from "react";
import { useEffect } from "react";
import { STRINGS } from "@/constants/strings";
import { forwardBoundaryError } from "@/features/observability/errorForwarding";

export interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The last-resort boundary. It is the ONLY thing that catches a throw from the root layout, and
 * React swaps it in for the entire document, so it must supply its own <html>/<body> and cannot use
 * Providers, the nav, fonts, or any other app-shell state.
 *
 * `reset()` re-renders the root. When the root layout is what failed (a bad env var, an unreachable
 * database) that will simply fail again, so the honest affordance is a full reload plus the digest
 * to look up in the server log.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps): React.ReactNode {
  useEffect(() => {
    console.error(error);
    forwardBoundaryError(error, { route: window.location.pathname, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center font-sans">
        <h1 className="text-lg font-semibold">{STRINGS.errors.appCrashTitle}</h1>
        <p className="max-w-md text-sm text-neutral-600">{STRINGS.errors.appCrashBody}</p>
        {error.digest !== undefined && error.digest !== "" ? (
          <p className="font-mono text-xs text-neutral-500">
            {STRINGS.errors.referenceLabel} {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          {STRINGS.errors.retry}
        </button>
      </body>
    </html>
  );
}
