"use client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import type { CalendarActivity } from "@/features/activities/calendar";
import { startTimeLabel } from "@/features/activities/weekAgenda";
import { ActivityChip } from "./calendarChip";

// What a day column shows in place of the activities it had no readable room for. The count is
// the point: a clipped lane looks like an empty afternoon, a counted one does not.
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
          // The block behind this chip is as tall as the span it stands for, but the chip itself is
          // one line; the rest lets clicks through to the hour slots instead of eating them.
          style={{ pointerEvents: "auto" }}
          className="block w-full truncate rounded px-1 my-0.5 text-left text-xs font-medium text-primary hover:bg-accent tabular-nums"
        >
          +{activities.length} more
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-72 overflow-y-auto">
        {/* One marker can stand for activities at different hours: a long activity keeps the
            cluster connected, and the marker sits at the earliest of them. Listed without their
            own start, the later ones would read as happening at the marker's hour. */}
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
