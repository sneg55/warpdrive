import type React from "react";
import { ACTOR_UNKNOWN, SOURCE_WEB_APP } from "@/constants/timelineSource";
import { formatUserName } from "@/features/identity/formatUserName";

function formatTimestamp(at: Date): string {
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Pipedrive's per-row attribution: "<time> · Name (Web App)". The actor name is
// humanized (an email-shaped name renders as a display name, never the raw email);
// the origin is a constant (single origin today). An unresolved actor renders a
// neutral fallback (ACTOR_UNKNOWN) with no source, so no email or "null" ever leaks.
export function AttributionLine({
  at,
  actorName,
}: {
  at: Date;
  actorName: string | null;
}): React.ReactNode {
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      <time dateTime={at.toISOString()}>{formatTimestamp(at)}</time>
      {actorName !== null
        ? ` · ${formatUserName(actorName)} (${SOURCE_WEB_APP})`
        : ` · ${ACTOR_UNKNOWN}`}
    </p>
  );
}
