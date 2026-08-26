// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_DAY_ROW_HEIGHT_PX } from "@/features/activities/agendaLayout";
import type { CalendarActivity } from "@/features/activities/calendar";
import { AllDayLane } from "./AllDayLane";

afterEach(() => {
  cleanup();
});

function allDay(id: string): CalendarActivity {
  return {
    id,
    subject: `Activity ${id}`,
    dueAt: new Date(2026, 6, 15, 0, 0),
    allDay: true,
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

function renderLane(items: CalendarActivity[], rows: number, onOpenActivity = vi.fn()) {
  render(
    <AllDayLane
      dayLabel="Wednesday 15 July 2026"
      items={items}
      rows={rows}
      onOpenActivity={onOpenActivity}
    />,
  );
  return { onOpenActivity };
}

describe("AllDayLane", () => {
  it("says which day it is the all-day lane for", () => {
    renderLane([], 1);
    expect(
      screen.getByRole("group", { name: "All day, Wednesday 15 July 2026" }),
    ).toBeInTheDocument();
  });

  it("reserves the week's lane height even on a day that has none", () => {
    // Each column stacks its hour grid under the lane row, so a lane that exists on only some days
    // would push those days' hours down and 09:00 would stop being level across the week.
    renderLane([], 2);
    const lane = document.querySelector("[data-all-day-lane]");
    expect((lane as HTMLElement).style.height).toBe(`${2 * ALL_DAY_ROW_HEIGHT_PX}px`);
  });

  it("keeps a timed activity out of the lane, since it belongs in the hour grid", () => {
    const timed = { ...allDay("timed"), allDay: false, durationMinutes: 60 };
    renderLane([timed], 1);
    expect(screen.queryByRole("button", { name: "Activity timed" })).toBeNull();
  });

  it("counts the all-day activities that outgrew the lane instead of clipping them", () => {
    renderLane(["a", "b", "c", "d"].map(allDay), 3);
    expect(screen.getByRole("button", { name: "Show 2 more activities" })).toBeInTheDocument();
  });

  it("opens an all-day activity through the same handler the hour grid uses", () => {
    const items = [allDay("a")];
    const { onOpenActivity } = renderLane(items, 1);
    fireEvent.click(screen.getByRole("button", { name: /Activity a/ }));
    expect(onOpenActivity).toHaveBeenCalledWith(items[0]);
  });
});
