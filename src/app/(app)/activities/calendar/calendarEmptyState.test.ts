import { describe, expect, it } from "vitest";
import { calendarEmptyState } from "./calendarEmptyState";

describe("calendarEmptyState", () => {
  // A blank grid said nothing at all. Whatever it says now must not confuse "this week holds
  // nothing" with "the filters hid everything in it".
  it("separates an empty window from a filter that matched nothing", () => {
    expect(
      calendarEmptyState({ view: "week", hasFilter: false, hasUnfilteredActivities: false }).kind,
    ).toBe("none");
    expect(
      calendarEmptyState({ view: "week", hasFilter: true, hasUnfilteredActivities: true }).kind,
    ).toBe("filtered");
  });

  // The filtered wording states as fact that the window holds activities. A window that is
  // genuinely empty while a filter happens to be on must not be described that way.
  it("does not blame the filter when the window holds nothing to exclude", () => {
    expect(
      calendarEmptyState({ view: "week", hasFilter: true, hasUnfilteredActivities: false }).kind,
    ).toBe("none");
  });

  it("names the window the user is actually looking at", () => {
    expect(
      calendarEmptyState({ view: "week", hasFilter: false, hasUnfilteredActivities: false }).title,
    ).toContain("week");
    expect(
      calendarEmptyState({ view: "month", hasFilter: false, hasUnfilteredActivities: false }).title,
    ).toContain("month");
  });

  it("gives every state a title, a sentence and an action", () => {
    for (const view of ["week", "month"] as const) {
      for (const hasFilter of [true, false]) {
        for (const hasUnfilteredActivities of [true, false]) {
          const state = calendarEmptyState({ view, hasFilter, hasUnfilteredActivities });
          expect(state.title.length).toBeGreaterThan(0);
          expect(state.body.length).toBeGreaterThan(0);
          expect(state.action.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
