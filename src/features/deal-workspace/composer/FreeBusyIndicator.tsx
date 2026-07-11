import type React from "react";
import { cn } from "@/lib/utils";

interface Props {
  busy: boolean;
}

// Read-only Free/Busy availability signal for the composer (Pipedrive parity, B3). Reflects a
// precomputed busy flag (see activities/availability.getBusyWindows); it is an indicator, not a
// scheduling control, so it renders no interactive surface.
export function FreeBusyIndicator({ busy }: Props): React.ReactNode {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium",
        busy ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          busy ? "bg-amber-500" : "bg-emerald-500",
        )}
      />
      {busy ? "Busy" : "Free"}
    </span>
  );
}
