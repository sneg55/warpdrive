"use client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import type { CalendarActivity } from "@/features/activities/calendar";
import { startTimeLabel } from "@/features/activities/weekAgenda";
import { ActivityChip } from "./calendarChip";

export function MoreActivitiesChip({
  activities,
  onOpen,
}: {
  activities: CalendarActivity[];
  onOpen: (activity: CalendarActivity) => void;
}): React.ReactNode {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show ${activities.length} more activities`}
          style={{ pointerEvents: "auto" }}
          className="block w-full truncate rounded px-1 my-0.5 text-left text-xs font-medium text-primary hover:bg-accent tabular-nums"
        >
          +{activities.length} more
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-72 overflow-y-auto">
        {activities.map((a) => (
          <div key={a.id} className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {a.allDay ? "All day" : startTimeLabel(a.dueAt)}
            </span>
            <ActivityChip a={a} onOpen={onOpen} className="min-w-0 flex-1" />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
