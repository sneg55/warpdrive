import type { CalendarActivity } from "@/features/activities/calendar";
import { isoToDayHeading } from "@/features/activities/dayHeading";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT_PX,
  placeBlock,
} from "@/features/activities/weekAgenda";
import { ActivityChip } from "./calendarChip";

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// One day's column in the hourly agenda: 24 clickable hour lanes (empty-slot create) with
// timed activities absolutely positioned over them via weekAgenda's pure placement math.
// Activities are placed independently of each other (no overlap/lane resolution, see
// weekAgenda.ts), so two overlapping activities simply stack with the later one on top.
export function AgendaDayColumn({
  iso,
  items,
  onOpenActivity,
  onOpenSlot,
}: {
  iso: string;
  items: CalendarActivity[];
  onOpenActivity: (activityId: string) => void;
  onOpenSlot: (hour: number) => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col border border-gray-200 rounded overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50 px-1 py-0.5 text-xs font-medium text-gray-500 tabular-nums">
        {isoToDayHeading(iso)}
      </div>
      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT_PX }}>
        {HOURS.map((hour) => (
          <button
            key={hour}
            type="button"
            aria-label={`Add activity on ${iso} at ${hourLabel(hour)}`}
            onClick={() => onOpenSlot(hour)}
            className="absolute inset-x-0 border-t border-gray-100 hover:bg-accent/30"
            style={{ top: hour * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
          />
        ))}
        {items.map((a) => {
          const { topPx, heightPx } = placeBlock(a.dueAt, a.durationMinutes);
          // Clamp to the hours actually remaining in the day: this column wraps content in
          // overflow-hidden, so an activity starting late (e.g. 23:00 + 120min) would otherwise
          // silently clip past midnight instead of ending visibly at the day boundary.
          const maxHeightPx = HOURS.length * HOUR_HEIGHT_PX - topPx;
          const clampedHeightPx = Math.min(heightPx, maxHeightPx);
          return (
            <div
              key={a.id}
              className="absolute inset-x-0.5 z-10 overflow-hidden"
              style={{ top: topPx, height: clampedHeightPx }}
            >
              <ActivityChip a={a} onOpen={onOpenActivity} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
