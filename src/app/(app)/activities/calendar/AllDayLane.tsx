import {
  ALL_DAY_ROW_HEIGHT_PX,
  splitAllDay,
  splitAllDayDisplay,
} from "@/features/activities/agendaLayout";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityChip } from "./calendarChip";
import { MoreActivitiesChip } from "./MoreActivitiesChip";

// One day's all-day activities. Every lane in the week reserves the same number of rows so the
// hour grids underneath all start at the same y and a given hour stays level across the week.
export function AllDayLane({
  dayLabel,
  items,
  rows,
  onOpenActivity,
}: {
  dayLabel: string;
  items: CalendarActivity[];
  rows: number;
  onOpenActivity: (activity: CalendarActivity) => void;
}): React.ReactNode {
  const { allDay } = splitAllDay(items);
  const { visible, hidden } = splitAllDayDisplay(allDay, rows);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a calendar lane is not a form <fieldset>
    <div
      data-all-day-lane
      role="group"
      aria-label={`All day, ${dayLabel}`}
      className="overflow-hidden border-l border-border px-0.5"
      style={{ height: rows * ALL_DAY_ROW_HEIGHT_PX }}
    >
      {visible.map((a) => (
        <ActivityChip key={a.id} a={a} onOpen={onOpenActivity} />
      ))}
      {hidden.length > 0 && <MoreActivitiesChip activities={hidden} onOpen={onOpenActivity} />}
    </div>
  );
}
