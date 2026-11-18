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
    const currentYear = new Date().getFullYear();
    const onChange = vi.fn();
    render(
      <DatePicker value={`${currentYear}-12-01`} onChange={onChange} ariaLabel="Start date" />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    fireEvent.click(await screen.findByRole("button", { name: "Go to the Next Month" }));
    fireEvent.click(screen.getByText("15"));
    expect(onChange).toHaveBeenCalledWith(`${currentYear + 1}-01-15`);
  });

  it("renders a per-day accessory and its hint for the days that have one", async () => {
    render(
      <DatePicker
        value="2026-07-04"
        onChange={vi.fn()}
        ariaLabel="Start date"
        dayAccessory={(ymd) =>
          ymd === "2026-07-15"
            ? { indicator: <span data-testid="dot" />, hint: "3 activities" }
            : null
        }
      />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    const decorated = (await screen.findByText("15")).closest("button");
    expect(decorated?.querySelector("[data-testid='dot']")).not.toBeNull();
    expect(decorated).toHaveAccessibleName(/3 activities/);
    const plain = screen.getByText("16").closest("button");
    expect(plain?.querySelector("[data-testid='dot']")).toBeNull();
  });

  it("reports open and close so a caller can drop state the calendar forgot", async () => {
    const onOpenChange = vi.fn();
    render(
      <DatePicker
        value="2026-07-04"
        onChange={vi.fn()}
        ariaLabel="Start date"
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports the visible month so a caller can load data for it", async () => {
    const onMonthChange = vi.fn();
    render(
      <DatePicker
        value="2026-07-04"
        onChange={vi.fn()}
        ariaLabel="Start date"
        onMonthChange={onMonthChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Start date"));
    fireEvent.click(await screen.findByRole("button", { name: "Go to the Next Month" }));
    expect(onMonthChange).toHaveBeenCalled();
    const month = onMonthChange.mock.calls[0]?.[0] as Date;
    expect(month.getMonth()).toBe(7);
    expect(month.getFullYear()).toBe(2026);
  });
});
