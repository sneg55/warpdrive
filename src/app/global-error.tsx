"use client";
import type React from "react";
import { useEffect } from "react";
import { STRINGS } from "@/constants/strings";
import { forwardBoundaryError } from "@/features/observability/errorForwarding";

export interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps): React.ReactNode {
  useEffect(() => {
    console.error(error);
    forwardBoundaryError(error, { route: window.location.pathname, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center font-sans">
        <h1 className="text-lg font-semibold">{STRINGS.errors.appCrashTitle}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{STRINGS.errors.appCrashBody}</p>
        {error.digest !== undefined && error.digest !== "" ? (
          <p className="font-mono text-xs text-muted-foreground">
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
