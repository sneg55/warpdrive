// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: { listTypes: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/features/activities/AddActivityModal", () => ({
  AddActivityModal: () => <div data-testid="add-activity-modal" />,
}));
// Stand-in for the filter bar: one control that turns a type filter on, which is all this test
// needs to reach the awkward state (a filter is active and the window is empty).
vi.mock("./CalendarFilterBar", () => ({
  CalendarFilterBar: (p: {
    onChange: (f: { ownerId: null; typeKey: string; done: "all" }) => void;
  }) => (
    <button
      type="button"
      onClick={() => p.onChange({ ownerId: null, typeKey: "call", done: "all" })}
    >
      filter-calls
    </button>
  ),
}));

import { STRINGS } from "@/constants/strings";
import { FilterableCalendar } from "./FilterableCalendar";

afterEach(cleanup);

const dayIsos = ["2026-06-15", "2026-06-16"];

function meeting(id: string): CalendarActivity {
  return {
    id,
    subject: id,
    dueAt: new Date("2026-06-15T10:00:00Z"),
    allDay: false,
    durationMinutes: null,
    typeKey: "meeting",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

function renderCalendar(activities: CalendarActivity[]): void {
  render(
    <FilterableCalendar
      view="week"
      anchorIso="2026-06-15"
      dayIsos={dayIsos}
      activities={activities}
    />,
  );
}

it("blames the filter when the window held activities it excluded", () => {
  renderCalendar([meeting("a")]);
  fireEvent.click(screen.getByRole("button", { name: "filter-calls" }));

  expect(screen.getByRole("status")).toHaveTextContent(STRINGS.calendar.emptyFilteredBody);
});

// Step to a far-future week with any filter on and the app used to state that the window does
// have activities. It does not, and the sentence was simply false.
it("does not claim an empty window holds activities just because a filter is on", () => {
  renderCalendar([]);
  fireEvent.click(screen.getByRole("button", { name: "filter-calls" }));

  const empty = screen.getByRole("status");
  expect(empty).not.toHaveTextContent(STRINGS.calendar.emptyFilteredBody);
  expect(empty).toHaveTextContent(STRINGS.calendar.emptyBody);
});
