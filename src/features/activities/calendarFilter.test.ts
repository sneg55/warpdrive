import { describe, expect, it } from "vitest";
import {
  type CalendarFilterState,
  filterCalendarActivities,
  NO_CALENDAR_FILTER,
} from "./calendarFilter";

type Row = { id: string; assigneeId: string | null; typeKey: string; done: boolean };

const rows: Row[] = [
  { id: "a", assigneeId: "u1", typeKey: "call", done: false },
  { id: "b", assigneeId: "u2", typeKey: "meeting", done: true },
  { id: "c", assigneeId: "u1", typeKey: "meeting", done: false },
  { id: "d", assigneeId: null, typeKey: "call", done: true },
];

describe("filterCalendarActivities", () => {
  it("returns everything when unfiltered", () => {
    expect(filterCalendarActivities(rows, NO_CALENDAR_FILTER).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("narrows by owner (assignee)", () => {
    const f: CalendarFilterState = { ownerId: "u1", typeKey: null, done: "all" };
    expect(filterCalendarActivities(rows, f).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("narrows by activity type", () => {
    const f: CalendarFilterState = { ownerId: null, typeKey: "meeting", done: "all" };
    expect(filterCalendarActivities(rows, f).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("narrows by open status", () => {
    const f: CalendarFilterState = { ownerId: null, typeKey: null, done: "open" };
    expect(filterCalendarActivities(rows, f).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("narrows by done status", () => {
    const f: CalendarFilterState = { ownerId: null, typeKey: null, done: "done" };
    expect(filterCalendarActivities(rows, f).map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("applies owner, type, and status together", () => {
    const f: CalendarFilterState = { ownerId: "u1", typeKey: "meeting", done: "open" };
    expect(filterCalendarActivities(rows, f).map((r) => r.id)).toEqual(["c"]);
  });
});
