// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActivitiesFilters } from "./ActivitiesFilters";
import type { ActivityListFilter } from "./schemas";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk (Combobox) observes its list's size to manage height; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(() => {
  cleanup();
});

const baseFilter: ActivityListFilter = {
  ownerId: null,
  done: "open",
  from: null,
  to: null,
  typeKey: null,
};
const owners = [{ value: "u1", label: "Ann", avatarName: "Ann" }];
const types = [
  { key: "call", name: "Call" },
  { key: "custom1", name: "Site visit" },
];

describe("ActivitiesFilters", () => {
  it("emits a filter with the chosen owner, done state, and type", () => {
    const onChange = vi.fn();
    render(
      <ActivitiesFilters filter={baseFilter} onChange={onChange} owners={owners} types={types} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Site visit" })); // custom type tab
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ typeKey: "custom1" }));
  });

  it("the All tab resets typeKey to null", () => {
    const onChange = vi.fn();
    render(
      <ActivitiesFilters
        filter={{ ...baseFilter, typeKey: "call" }}
        onChange={onChange}
        owners={owners}
        types={types}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ typeKey: null }));
  });

  it("a custom type slugified to 'all' does not collide with the All tab", () => {
    const onChange = vi.fn();
    const collidingTypes = [...types, { key: "all", name: "All" }];
    render(
      <ActivitiesFilters
        filter={baseFilter}
        onChange={onChange}
        owners={owners}
        types={collidingTypes}
      />,
    );
    const allButtons = screen.getAllByRole("button", { name: "All" });
    expect(allButtons).toHaveLength(2);

    fireEvent.click(allButtons[1] as HTMLElement); // the custom type tab keyed "all"
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ typeKey: "all" }));

    fireEvent.click(allButtons[0] as HTMLElement); // the synthetic "All types" tab
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ typeKey: null }));
  });

  it("picking an owner from the Combobox sets ownerId", () => {
    const onChange = vi.fn();
    render(
      <ActivitiesFilters filter={baseFilter} onChange={onChange} owners={owners} types={types} />,
    );
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Ann"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ ownerId: "u1" }));
  });

  it("changing the Status select sets done", () => {
    const onChange = vi.fn();
    render(
      <ActivitiesFilters filter={baseFilter} onChange={onChange} owners={owners} types={types} />,
    );
    fireEvent.click(screen.getByLabelText("Status"));
    fireEvent.click(screen.getByRole("option", { name: "Completed" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ done: "done" }));
  });

  it("picking a From date sets filter.from", () => {
    const onChange = vi.fn();
    render(
      <ActivitiesFilters filter={baseFilter} onChange={onChange} owners={owners} types={types} />,
    );
    fireEvent.click(screen.getByLabelText("From"));
    fireEvent.click(screen.getByText("15"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: expect.any(String) }),
    );
  });

  it("picking a To date sets filter.to", () => {
    const onChange = vi.fn();
    render(
      <ActivitiesFilters filter={baseFilter} onChange={onChange} owners={owners} types={types} />,
    );
    fireEvent.click(screen.getByLabelText("To"));
    fireEvent.click(screen.getByText("15"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ to: expect.any(String) }));
  });
});
