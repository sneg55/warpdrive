// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { MoreActivitiesChip } from "./MoreActivitiesChip";

afterEach(cleanup);

function mk(id: string, dueAt: Date, allDay = false): CalendarActivity {
  return {
    id,
    subject: `Activity ${id}`,
    dueAt,
    allDay,
    durationMinutes: allDay ? null : 60,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

describe("MoreActivitiesChip", () => {
  it("gives each hidden activity its own start time", () => {
    // One overflow marker can stand for activities at different hours, because a long activity
    // keeps the cluster connected. Listed without times they all read as the marker's own hour.
    const items = [mk("a", new Date(2026, 6, 15, 9, 0)), mk("b", new Date(2026, 6, 15, 11, 30))];
    render(<MoreActivitiesChip activities={items} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more activities" }));
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("11:30")).toBeInTheDocument();
  });

  it("says all-day rather than echoing the midnight an all-day activity is stored at", () => {
    render(
      <MoreActivitiesChip
        activities={[mk("a", new Date(2026, 6, 15, 0, 0), true)]}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more activities" }));
    expect(screen.getByText("All day")).toBeInTheDocument();
    expect(screen.queryByText("00:00")).toBeNull();
  });
});
