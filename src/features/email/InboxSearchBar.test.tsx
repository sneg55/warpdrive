// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxSearchBar } from "./InboxSearchBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// A2 (Pipedrive parity): the search is a collapsed icon by default and expands to an input on
// activation, instead of a persistent full-width field.
describe("InboxSearchBar collapse (A2)", () => {
  it("renders collapsed as a search icon button by default (no input shown)", () => {
    render(<InboxSearchBar onQuery={() => {}} />);
    expect(screen.getByRole("button", { name: "Search mail" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("expands to a search input when the icon is activated", () => {
    render(<InboxSearchBar onQuery={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Search mail" }));
    expect(screen.getByRole("searchbox", { name: "Search mail" })).toBeInTheDocument();
  });
});

describe("InboxSearchBar", () => {
  function expandAndGetInput(): HTMLElement {
    fireEvent.click(screen.getByRole("button", { name: "Search mail" }));
    return screen.getByRole("searchbox", { name: "Search mail" });
  }

  it("debounces typed input before calling onQuery", () => {
    vi.useFakeTimers();
    const onQuery = vi.fn();
    render(<InboxSearchBar onQuery={onQuery} />);
    fireEvent.change(expandAndGetInput(), { target: { value: "budget" } });
    expect(onQuery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onQuery).toHaveBeenCalledWith("budget");
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it("calls onQuery with an empty string immediately when cleared", () => {
    vi.useFakeTimers();
    const onQuery = vi.fn();
    render(<InboxSearchBar onQuery={onQuery} />);
    const input = expandAndGetInput();
    fireEvent.change(input, { target: { value: "budget" } });
    vi.advanceTimersByTime(250);
    onQuery.mockClear();

    fireEvent.change(input, { target: { value: "" } });
    expect(onQuery).toHaveBeenCalledWith("");
  });
});
