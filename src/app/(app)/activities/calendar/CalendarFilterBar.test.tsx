// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NO_CALENDAR_FILTER } from "@/features/activities/calendarFilter";
import { CalendarFilterBar } from "./CalendarFilterBar";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(cleanup);

const owners = [{ value: "u1", label: "Alice" }];
const types = [
  { key: "call", name: "Call" },
  { key: "meeting", name: "Meeting" },
];

describe("CalendarFilterBar", () => {
  it("sizes the owner and status pickers instead of letting them span the page", () => {
    // Both primitives default to w-full. Dropped into a bare flex row with no width of their own,
    // each claimed a whole line and wrapped, so two one-word pickers rendered full-bleed, stacked.
    render(
      <CalendarFilterBar
        filter={NO_CALENDAR_FILTER}
        onChange={() => {}}
        owners={owners}
        types={types}
      />,
    );
    for (const name of ["Owner", "Status"]) {
      const trigger = screen.getByLabelText(name);
      expect(trigger).not.toHaveClass("w-full");
      expect(trigger).toHaveClass("w-52");
    }
  });

  it("renders owner, status, and type controls", () => {
    render(
      <CalendarFilterBar
        filter={NO_CALENDAR_FILTER}
        onChange={() => {}}
        owners={owners}
        types={types}
      />,
    );
    expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meeting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("selects an activity type", () => {
    const onChange = vi.fn();
    render(
      <CalendarFilterBar
        filter={NO_CALENDAR_FILTER}
        onChange={onChange}
        owners={owners}
        types={types}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Meeting" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ typeKey: "meeting" }));
  });

  it("clears the type back to All", () => {
    const onChange = vi.fn();
    render(
      <CalendarFilterBar
        filter={{ ownerId: null, typeKey: "meeting", done: "all" }}
        onChange={onChange}
        owners={owners}
        types={types}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ typeKey: null }));
  });
});
