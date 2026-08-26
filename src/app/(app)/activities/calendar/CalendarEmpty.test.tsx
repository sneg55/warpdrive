// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/features/activities/AddActivityModal", () => ({
  AddActivityModal: ({ defaultDate }: { defaultDate: string }) => (
    <div data-testid="add-activity-modal">{defaultDate}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { STRINGS } from "@/constants/strings";
import { CalendarEmpty } from "./CalendarEmpty";

it("offers the compose action it names, prefilled with the window on screen", () => {
  render(
    <CalendarEmpty
      view="week"
      hasFilter={false}
      hasUnfilteredActivities={false}
      dateIso="2026-06-15"
      onClearFilters={vi.fn()}
      onCreated={vi.fn()}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent(STRINGS.calendar.emptyBody);
  fireEvent.click(screen.getByRole("button", { name: STRINGS.calendar.emptyAction }));
  expect(screen.getByTestId("add-activity-modal")).toHaveTextContent("2026-06-15");
});

// "Nothing is scheduled" and "your filters hid everything" need different exits.
it("offers to clear the filters instead when a filter is what emptied the window", () => {
  const onClearFilters = vi.fn();
  render(
    <CalendarEmpty
      view="month"
      hasFilter
      hasUnfilteredActivities
      dateIso="2026-06-15"
      onClearFilters={onClearFilters}
      onCreated={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: STRINGS.calendar.emptyFilteredAction }));
  expect(onClearFilters).toHaveBeenCalledOnce();
  expect(screen.queryByTestId("add-activity-modal")).toBeNull();
});

// A far-future week holds nothing whether or not a filter is on. Saying "this window does have
// activities" there is simply false, which is the class of bug the empty states exist to remove.
it("does not claim the window holds activities when it holds none", () => {
  render(
    <CalendarEmpty
      view="week"
      hasFilter
      hasUnfilteredActivities={false}
      dateIso="2036-06-15"
      onClearFilters={vi.fn()}
      onCreated={vi.fn()}
    />,
  );

  const empty = screen.getByRole("status");
  expect(empty).not.toHaveTextContent(STRINGS.calendar.emptyFilteredBody);
  expect(empty).toHaveTextContent(STRINGS.calendar.emptyBody);
});
