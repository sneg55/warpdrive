import { STRINGS } from "@/constants/strings";
import type { CalendarViewName } from "@/features/activities/calendarView";

type CalendarEmptyKind = "none" | "filtered";

export interface CalendarEmpty {
  kind: CalendarEmptyKind;
  title: string;
  body: string;
  action: string;
}

export function calendarEmptyState({
  view,
  hasFilter,
  hasUnfilteredActivities,
}: {
  view: CalendarViewName;
  hasFilter: boolean;
  hasUnfilteredActivities: boolean;
}): CalendarEmpty {
  if (hasFilter && hasUnfilteredActivities) {
    return {
      kind: "filtered",
      title: STRINGS.calendar.emptyFilteredTitle(view),
      body: STRINGS.calendar.emptyFilteredBody,
      action: STRINGS.calendar.emptyFilteredAction,
    };
  }
  return {
    kind: "none",
    title: STRINGS.calendar.emptyTitle(view),
    body: STRINGS.calendar.emptyBody,
    action: STRINGS.calendar.emptyAction,
  };
}
