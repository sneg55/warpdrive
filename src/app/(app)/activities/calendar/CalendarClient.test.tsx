// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { monthGridDays } from "@/features/activities/monthGrid";
import { CalendarClient } from "./CalendarClient";
import { MonthView } from "./MonthView";

afterEach(cleanup);

const dayIsos = monthGridDays(new Date("2026-06-15T00:00:00Z")).map((d) =>
  d.toISOString().slice(0, 10),
);

function mk(id: string, dueIso: string, over = false): CalendarActivity {
  return {
    id,
    subject: id,
    dueAt: new Date(dueIso),
    durationMinutes: null,
    typeKey: "meeting",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: over,
    ownerName: null,
  };
}

it("renders a 42-cell month grid", () => {
  render(
    <MonthView anchorIso="2026-06-15" dayIsos={dayIsos} activities={[]} todayIso="2026-06-15" />,
  );
  expect(screen.getAllByRole("gridcell")).toHaveLength(42);
});

it("groups cells into rows so the ARIA grid is well-formed (header + 6 weeks)", () => {
  render(
    <MonthView anchorIso="2026-06-15" dayIsos={dayIsos} activities={[]} todayIso="2026-06-15" />,
  );
  // A valid grid is grid > row > gridcell. 1 weekday-header row + 6 week rows = 7.
  expect(screen.getAllByRole("row")).toHaveLength(7);
});

it("shows +N more linking to that day's week view when a cell exceeds 3 activities", () => {
  const acts = ["a", "b", "c", "d", "e"].map((id) => mk(id, "2026-06-15T10:00:00Z"));
  render(
    <MonthView anchorIso="2026-06-15" dayIsos={dayIsos} activities={acts} todayIso="2026-06-01" />,
  );
  const more = screen.getByRole("link", { name: /\+2 more/ });
  expect(more).toHaveAttribute("href", "/activities/calendar?view=week&d=2026-06-15");
});

it("de-emphasizes adjacent-month cells and marks today", () => {
  render(
    <MonthView anchorIso="2026-06-15" dayIsos={dayIsos} activities={[]} todayIso="2026-06-15" />,
  );
  // Leading cell June 1 is in-month; a trailing July cell is adjacent-month.
  const julyCell = screen.getByTestId("cell-2026-07-01");
  expect(julyCell).toHaveAttribute("data-adjacent", "true");
  const todayCell = screen.getByTestId("cell-2026-06-15");
  expect(todayCell).toHaveAttribute("data-today", "true");
});

it("toggle + prev/next/today render as links carrying the right params", () => {
  render(<CalendarClient view="month" anchorIso="2026-06-15" dayIsos={dayIsos} activities={[]} />);
  expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute(
    "href",
    "/activities/calendar?view=week&d=2026-06-15",
  );
  expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute(
    "href",
    "/activities/calendar?view=month&d=2026-05-15",
  );
  expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
    "href",
    "/activities/calendar?view=month&d=2026-07-15",
  );
  expect(screen.getByText("June 2026")).toBeInTheDocument();
});

it("renders the month grid when view=month (durability: same as a reloaded URL)", () => {
  render(<CalendarClient view="month" anchorIso="2026-06-15" dayIsos={dayIsos} activities={[]} />);
  expect(screen.getAllByRole("gridcell")).toHaveLength(42);
});
