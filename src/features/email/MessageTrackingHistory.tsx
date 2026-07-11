import { STRINGS } from "@/constants/strings";
import type { TrackingEvent } from "./trackingReads";

interface MessageTrackingHistoryProps {
  tracking: TrackingEvent[];
}

// Persisted per-message open/click summary (source of record): "Opened N times" /
// "Clicked N times" under an outbound message, derived from ThreadMessage.tracking.
// Renders nothing when the message has no history yet. This is separate from the
// transient WS trackingBadge shown in the thread header, which only nudges for the
// current session and disappears on reload; this component survives it.
export function MessageTrackingHistory({ tracking }: MessageTrackingHistoryProps): React.ReactNode {
  if (tracking.length === 0) return null;

  const opens = tracking.filter((t) => t.type === "open").length;
  const clicks = tracking.filter((t) => t.type === "click").length;

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground tabular-nums">
      {opens > 0 && (
        <span className="inline-block rounded-full bg-muted px-2 py-0.5">
          {STRINGS.inbox.trackingOpened(opens)}
        </span>
      )}
      {clicks > 0 && (
        <span className="inline-block rounded-full bg-muted px-2 py-0.5">
          {STRINGS.inbox.trackingClicked(clicks)}
        </span>
      )}
    </div>
  );
}
