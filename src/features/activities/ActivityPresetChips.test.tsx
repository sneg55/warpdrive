// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPresetChips } from "./ActivityPresetChips";

afterEach(cleanup);

const NOW = new Date(2026, 6, 8); // Wed 2026-07-08

describe("ActivityPresetChips", () => {
  it("renders the four preset chips", () => {
    render(<ActivityPresetChips from={null} to={null} onApply={() => {}} now={NOW} />);
    for (const name of ["Overdue", "Today", "This week", "To-do"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the chip matching the current range as pressed", () => {
    render(<ActivityPresetChips from="2026-07-08" to="2026-07-08" onApply={() => {}} now={NOW} />);
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Overdue" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("applies the range for the clicked chip", () => {
    const onApply = vi.fn();
    render(<ActivityPresetChips from={null} to={null} onApply={onApply} now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    expect(onApply).toHaveBeenCalledWith({ from: null, to: "2026-07-07" });
  });
});
