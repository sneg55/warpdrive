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
  allDay: false,
  durationMinutes: null,
  typeKey: "call",
  done: false,
  dealId: "d1",
  dealTitle: "Acme renewal",
  personId: null,
  orgId: null,
  overdue: false,
  ownerName: "Ann Owner",
};

describe("ActivityChip", () => {
  it("deep-links to the parent record when no onOpen handler is given (read-only calendar views)", () => {
    render(<ActivityChip a={activity} />);
    const link = screen.getByRole("link", { name: /Call Ann/ });
    expect(link).toHaveAttribute("href", "/deals/d1");
  });

  it("names the deal beside the subject, so a column of 'Email' chips can be told apart", () => {
    render(<ActivityChip a={activity} />);
    expect(screen.getByText("Acme renewal")).toBeInTheDocument();
  });

  it("keeps the parent name at a readable weight rather than fading it below AA", () => {
    // opacity-60 on 11px text measured 3.93:1 on the normal chip and 2.96:1 on the overdue one,
    // both under the 4.5:1 floor. An explicit secondary colour clears it on either background.
    render(<ActivityChip a={activity} />);
    const parent = screen.getByText("Acme renewal");
    expect(parent).toHaveClass("text-foreground/70");
    expect(parent.className).not.toMatch(/opacity-/);
  });

  it("names the contact when the activity hangs off a person rather than a deal", () => {
    const onPerson = { ...activity, dealId: null, dealTitle: null, personId: "p1" };
    render(<ActivityChip a={{ ...onPerson, personName: "Ann Lee" }} />);
    expect(screen.getByText("Ann Lee")).toBeInTheDocument();
  });

  it("says nothing about a parent when the activity has none", () => {
    const orphan = { ...activity, dealId: null, dealTitle: null };
    render(<ActivityChip a={orphan} />);
    expect(screen.queryByText("Acme renewal")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hands onOpen the whole activity, so the caller can route to its record", () => {
    const onOpen = vi.fn();
    render(<ActivityChip a={activity} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Call Ann/ }));
    expect(onOpen).toHaveBeenCalledWith(activity);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("tones the neutral chip with theme tokens and pairs the overdue red for Night", () => {
    const { container, rerender } = render(<ActivityChip a={activity} />);
    const chip = container.querySelector("[data-type]");
    expect(chip).toHaveClass("bg-muted", "text-foreground");
    rerender(<ActivityChip a={{ ...activity, overdue: true }} />);
    expect(container.querySelector("[data-type]")).toHaveClass("dark:bg-red-950");
  });
});
