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

export default function AppSegmentError({ error, reset }: AppSegmentErrorProps): React.ReactNode {
  useEffect(() => {
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
