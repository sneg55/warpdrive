// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxSearchBar } from "./InboxSearchBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InboxSearchBar", () => {
  it("debounces typed input before calling onQuery", () => {
    vi.useFakeTimers();
    const onQuery = vi.fn();
    render(<InboxSearchBar onQuery={onQuery} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search mail" }), {
      target: { value: "budget" },
    });
    expect(onQuery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onQuery).toHaveBeenCalledWith("budget");
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it("calls onQuery with an empty string immediately when cleared", () => {
    vi.useFakeTimers();
    const onQuery = vi.fn();
    render(<InboxSearchBar onQuery={onQuery} />);
    const input = screen.getByRole("searchbox", { name: "Search mail" });
    fireEvent.change(input, { target: { value: "budget" } });
    vi.advanceTimersByTime(250);
    onQuery.mockClear();

    fireEvent.change(input, { target: { value: "" } });
    expect(onQuery).toHaveBeenCalledWith("");
  });
});
