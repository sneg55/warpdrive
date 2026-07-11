// @vitest-environment jsdom
// src/components/ui/MultiCombobox.test.tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MultiCombobox } from "./MultiCombobox";

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

describe("MultiCombobox", () => {
  const options = [
    { value: "mia", label: "Mia Silva" },
    { value: "kai", label: "Kai Carter" },
  ];

  it("shows the placeholder when nothing is selected", () => {
    render(
      <MultiCombobox
        values={[]}
        onChange={vi.fn()}
        options={options}
        ariaLabel="Participants"
        placeholder="Add participants"
      />,
    );
    expect(screen.getByText("Add participants")).toBeInTheDocument();
  });

  it("renders a chip for each selected value", () => {
    render(
      <MultiCombobox
        values={["mia"]}
        onChange={vi.fn()}
        options={options}
        ariaLabel="Participants"
      />,
    );
    // Popover is closed, so the only "Mia Silva" text is the chip.
    expect(screen.getByText("Mia Silva")).toBeInTheDocument();
  });

  it("adds an option to the selection when picked from the list", () => {
    const onChange = vi.fn();
    render(
      <MultiCombobox
        values={["mia"]}
        onChange={onChange}
        options={options}
        ariaLabel="Participants"
      />,
    );
    fireEvent.click(screen.getByLabelText("Participants"));
    fireEvent.click(screen.getByRole("option", { name: /Kai Carter/ }));
    expect(onChange).toHaveBeenCalledWith(["mia", "kai"]);
  });

  it("toggles an already-selected option off when picked again", () => {
    const onChange = vi.fn();
    render(
      <MultiCombobox
        values={["mia", "kai"]}
        onChange={onChange}
        options={options}
        ariaLabel="Participants"
      />,
    );
    fireEvent.click(screen.getByLabelText("Participants"));
    fireEvent.click(screen.getByRole("option", { name: /Mia Silva/ }));
    expect(onChange).toHaveBeenCalledWith(["kai"]);
  });

  it("removes a value when its chip remove button is clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiCombobox
        values={["mia", "kai"]}
        onChange={onChange}
        options={options}
        ariaLabel="Participants"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Mia Silva" }));
    expect(onChange).toHaveBeenCalledWith(["kai"]);
  });
});
