import type React from "react";
import { ACTOR_UNKNOWN, SOURCE_WEB_APP } from "@/constants/timelineSource";
import { formatTimelineEmailDate } from "@/features/email/inboxDate";
import { formatUserName } from "@/features/identity/formatUserName";

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
