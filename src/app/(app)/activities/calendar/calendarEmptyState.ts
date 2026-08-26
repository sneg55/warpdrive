import { STRINGS } from "@/constants/strings";
import type { CalendarViewName } from "@/features/activities/calendarView";

export type CalendarEmptyKind = "none" | "filtered";

export interface CalendarEmpty {
  kind: CalendarEmptyKind;
  title: string;
  body: string;
  action: string;
}

// A blank grid is not a message. This says which window is empty and why, so "this week holds
// nothing" is never mistaken for "the filters hid everything in it".
export function calendarEmptyState({
  view,
  hasFilter,
  hasUnfilteredActivities,
}: {
  view: CalendarViewName;
  hasFilter: boolean;
  // Whether the window holds anything at all before the filter runs. The filtered wording states
  // as fact that there is something to exclude, so an empty window must not use it.
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
