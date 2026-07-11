// @vitest-environment jsdom
// src/components/ui/Select.test.tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("Select", () => {
  const options = [
    { value: "a", label: "Call" },
    { value: "b", label: "Meeting" },
  ];

  it("shows the selected label and emits on change", () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={options} ariaLabel="Type" />);
    const trigger = screen.getByLabelText("Type");
    expect(trigger).toHaveTextContent("Call");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Meeting" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("renders a leading icon for options that have one", () => {
    const onChange = vi.fn();
    const iconOptions = [
      { value: "a", label: "Call", icon: <span data-testid="call-icon">C</span> },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="a" onChange={onChange} options={iconOptions} ariaLabel="Type" />);
    fireEvent.click(screen.getByLabelText("Type"));
    expect(screen.getByTestId("call-icon")).toBeInTheDocument();
  });

  // Radix reserves value="" internally to mean "nothing selected, show the placeholder".
  // Many callers pass a real option like { value: "", label: "None" } (priority, org, owner,
  // source channel, default visibility), so when "" IS the selected value, Radix shows the
  // placeholder text instead of that option's label, and swallows re-selecting it. Opening the
  // dropdown must show and let you choose that option; the trigger must reflect its label.
  it("shows the empty-value option's label on the trigger, not the placeholder", () => {
    const onChange = vi.fn();
    const emptyOptions = [
      { value: "", label: "None" },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="" onChange={onChange} options={emptyOptions} ariaLabel="Type" />);
    const trigger = screen.getByLabelText("Type");
    expect(trigger).toHaveTextContent("None");
  });

  it("renders the empty-value option in the dropdown and decodes it back to onChange('')", () => {
    const onChange = vi.fn();
    const emptyOptions = [
      { value: "", label: "None" },
      { value: "b", label: "Meeting" },
    ];
    render(<Select value="b" onChange={onChange} options={emptyOptions} ariaLabel="Type" />);
    fireEvent.click(screen.getByLabelText("Type"));
    expect(screen.getByRole("option", { name: "None" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
