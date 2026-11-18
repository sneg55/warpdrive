// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { INLINE_CONTROL_SURFACE } from "@/components/ui/inlineControlSurface";
import { AddActivityToggle } from "./AddActivityToggle";
import { COMPOSER_STRINGS } from "./composer.constants";

describe("AddActivityToggle", () => {
  it("renders a toggle button with an info tooltip container", () => {
    render(<AddActivityToggle checked={false} onChange={vi.fn()} />);
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
    const infoEl = screen.getByLabelText(/activity will be logged/i);
    expect(infoEl).toBeInTheDocument();
  });

  it("(item 7) checkbox is named by its design-system aria-label with visible text alongside", () => {
    render(<AddActivityToggle checked={false} onChange={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /add as activity/i });
    expect(checkboxes).toHaveLength(1);
    expect(screen.getByText(/add as activity/i)).toBeInTheDocument();
  });

  it("toggles when the visible label text is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddActivityToggle checked={false} onChange={onChange} />);
    await user.click(screen.getByText(COMPOSER_STRINGS.addAsActivityLabel));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("carries the same inline hover surface as the visibility control", () => {
    render(<AddActivityToggle checked={false} onChange={vi.fn()} />);
    const wrapper = screen.getByRole("checkbox", { name: /add as activity/i }).parentElement;
    expect(wrapper).toHaveClass(...INLINE_CONTROL_SURFACE.split(" "));
  });

  it("does not toggle when the info icon is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddActivityToggle checked={false} onChange={onChange} />);
    await user.click(screen.getByLabelText(/activity will be logged/i));
    expect(onChange).not.toHaveBeenCalled();
  });
});
