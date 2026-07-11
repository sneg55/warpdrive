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
