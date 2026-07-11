// Client-side calendar filters (AC1): narrow the in-window activities by owner (assignee),
// activity type, and open/done status, reusing the same three axes the list toolbar offers.
// The calendar's date window is the view itself, so there is no from/to here. Pure so it is
// unit-testable and folder/view-agnostic.

export interface CalendarFilterState {
  // null = all owners; otherwise the assignee user id.
  ownerId: string | null;
  // null = all types; otherwise the activity type key.
  typeKey: string | null;
  done: "open" | "done" | "all";
}

export const NO_CALENDAR_FILTER: CalendarFilterState = {
  ownerId: null,
  typeKey: null,
  done: "all",
};

export function filterCalendarActivities<
  T extends { assigneeId?: string | null; typeKey: string; done: boolean },
>(activities: T[], { ownerId, typeKey, done }: CalendarFilterState): T[] {
  return activities.filter(
    (a) =>
      (ownerId === null || a.assigneeId === ownerId) &&
      (typeKey === null || a.typeKey === typeKey) &&
      (done === "all" || (done === "open" ? !a.done : a.done)),
  );
}
