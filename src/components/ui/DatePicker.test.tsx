// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

// vitest.config.ts sets globals: false, so @testing-library/react's auto
// cleanup (which checks for a global `afterEach`) never registers; without
// this, renders from earlier `it` blocks accumulate in the same jsdom document.
afterEach(() => {
  cleanup();
});

describe("DatePicker", () => {
  it("shows MM/DD/YYYY for the current value", () => {
    render(<DatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />);
    expect(screen.getByLabelText("Start date")).toHaveTextContent("07/04/2026");
  });

  it("emits YYYY-MM-DD when a day is picked", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-04" onChange={onChange} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));
    // v10's DayButton sets aria-label to the full formatted date ("PPPP", e.g.
    // "Wednesday, July 15th, 2026") for a11y, so the accessible *name* is not
    // "15"; the visible day-of-month is the button's text content instead.
    // findByText (not getByText): the calendar is a next/dynamic chunk that loads on open.
    fireEvent.click(await screen.findByText("15"));
    expect(onChange).toHaveBeenCalledWith("2026-07-15");
  });

  it("clears via the Clear control", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-04" onChange={onChange} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("allows navigating into a future year via the next-month control", async () => {
    // Regression for: captionLayout="dropdown" without startMonth/endMonth
    // caps react-day-picker v10's navigable range at Dec 31 of the current
    // year, so the next-month chevron silently no-ops there and future
    // years are unreachable. Starting from December of the current year and
    // clicking "next month" must land on January of next year.
    const currentYear = new Date().getFullYear();
    const onChange = vi.fn();
    render(
      <DatePicker value={`${currentYear}-12-01`} onChange={onChange} ariaLabel="Start date" />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    // findByRole: the calendar (a next/dynamic chunk) loads on open; once awaited it is present.
    fireEvent.click(await screen.findByRole("button", { name: "Go to the Next Month" }));
    fireEvent.click(screen.getByText("15"));
    expect(onChange).toHaveBeenCalledWith(`${currentYear + 1}-01-15`);
  });
});
