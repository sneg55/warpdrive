// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { AddActivityToggle } from "./AddActivityToggle";

describe("AddActivityToggle", () => {
  it("renders a toggle button with an info tooltip container", () => {
    render(<AddActivityToggle checked={false} onChange={vi.fn()} />);
    // The toggle should be present as a checkbox
    const toggle = screen.getByRole("checkbox", { name: /add as activity/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it("reflects checked state when true", () => {
    render(<AddActivityToggle checked={true} onChange={vi.fn()} />);
    const toggle = screen.getByRole("checkbox", { name: /add as activity/i });
    expect(toggle).toBeChecked();
  });

  it("calls onChange with the new value when clicked", () => {
    const onChange = vi.fn();
    render(<AddActivityToggle checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /add as activity/i }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders an info tooltip element", () => {
    render(<AddActivityToggle checked={false} onChange={vi.fn()} />);
    // Info tooltip should be present (a title attribute or aria-label on an info icon)
    const infoEl = screen.getByTitle(/activity will be logged/i);
    expect(infoEl).toBeInTheDocument();
  });

  // Item 7: the design-system Checkbox primitive (a Radix role="checkbox" button)
  // carries its own accessible name via aria-label, and the visible text sits beside
  // it. The checkbox must resolve to exactly one control named by that label, with no
  // duplicate/ambiguous naming.
  it("(item 7) checkbox is named by its design-system aria-label with visible text alongside", () => {
    render(<AddActivityToggle checked={false} onChange={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /add as activity/i });
    expect(checkboxes).toHaveLength(1);
    expect(screen.getByText(/add as activity/i)).toBeInTheDocument();
  });
});
