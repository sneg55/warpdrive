import type React from "react";
import { ACTOR_UNKNOWN, SOURCE_WEB_APP } from "@/constants/timelineSource";
import { formatTimelineEmailDate } from "@/features/email/inboxDate";
import { formatUserName } from "@/features/identity/formatUserName";

// Pipedrive's per-row attribution: "<time> · Name (Web App)". The visible time uses the same
// relative timeline format the email cards in this feed use, so one history no longer mixes
// "6:38 AM (2 minutes ago)" with "Aug 27, 2026, 6:38 AM". The actor name is
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
      <time dateTime={at.toISOString()}>{formatTimelineEmailDate(at.toISOString())}</time>
      {actorName !== null
        ? ` · ${formatUserName(actorName)} (${SOURCE_WEB_APP})`
        : ` · ${ACTOR_UNKNOWN}`}
    </p>
  );
}
