// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityChip } from "./calendarChip";

afterEach(() => {
  cleanup();
});

const activity: CalendarActivity = {
  id: "a1",
  subject: "Call Ann",
  dueAt: new Date("2026-07-15T14:30:00.000Z"),
  durationMinutes: null,
  typeKey: "call",
  done: false,
  dealId: "d1",
  personId: null,
  orgId: null,
  overdue: false,
  ownerName: "Ann Owner",
};

describe("ActivityChip", () => {
  it("deep-links to the parent record when no onOpen handler is given (read-only calendar views)", () => {
    render(<ActivityChip a={activity} />);
    const link = screen.getByRole("link", { name: "Call Ann" });
    expect(link).toHaveAttribute("href", "/deals/d1");
  });

  it("opens the activity via onOpen instead of only deep-linking, when a handler is given", () => {
    const onOpen = vi.fn();
    render(<ActivityChip a={activity} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Call Ann" }));
    expect(onOpen).toHaveBeenCalledWith("a1");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
