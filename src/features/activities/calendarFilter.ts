export interface CalendarFilterState {
  ownerId: string | null;
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
