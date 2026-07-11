// @vitest-environment jsdom
// src/components/ui/Combobox.test.tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk observes its list's size to manage height; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(() => {
  cleanup();
});

describe("Combobox", () => {
  const options = [
    { value: "u1", label: "Ann Owner", avatarName: "Ann Owner" },
    { value: "u2", label: "Bob Rep", avatarName: "Bob Rep" },
  ];

  it("filters by type-ahead and emits the picked value", () => {
    const onChange = vi.fn();
    render(<Combobox value="u1" onChange={onChange} options={options} ariaLabel="Owner" />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "Bob" } });
    // Prove the type-ahead actually narrows the option list to the single
    // match (not just that an already-visible row is clickable). Ann Owner
    // still shows in the trigger since it is the current value, so assert on
    // the option role, which is list-scoped.
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Bob Rep");
    fireEvent.click(screen.getByText("Bob Rep"));
    expect(onChange).toHaveBeenCalledWith("u2");
  });

  it("shows the selected option's avatar in the trigger", () => {
    const onChange = vi.fn();
    render(<Combobox value="u2" onChange={onChange} options={options} ariaLabel="Owner" />);
    const trigger = screen.getByLabelText("Owner");
    expect(trigger).toHaveTextContent("Bob Rep");
    expect(screen.getByRole("img", { name: "Bob Rep" })).toBeInTheDocument();
  });
});
