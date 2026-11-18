// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const { pushMock, useQueryMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useQueryMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    search: {
      query: {
        useQuery: useQueryMock,
      },
    },
  },
}));

import type { SearchResults } from "@/types/search";
import { CommandPalette } from "./CommandPalette";
import { OPEN_SEARCH_EVENT } from "./events";

const EMPTY_RESULTS: SearchResults = { deals: [], people: [], organizations: [], leads: [] };

function setResults(results: SearchResults) {
  useQueryMock.mockReturnValue({ data: results });
}

beforeEach(() => {
  pushMock.mockClear();
  setResults(EMPTY_RESULTS);
  vi.useFakeTimers();
});

function openAndSearch(query: string) {
  render(<CommandPalette />);
  fireEvent(window, new Event(OPEN_SEARCH_EVENT));
  const input = screen.getByRole("searchbox", { name: "Search" });
  fireEvent.change(input, { target: { value: query } });
  act(() => {
    vi.advanceTimersByTime(200);
  });
  return input;
}

describe("CommandPalette keyboard navigation", () => {
  const MIXED_RESULTS: SearchResults = {
    deals: [{ id: "d1", primary: "Deal A", secondary: null }],
    people: [],
    organizations: [],
    leads: [{ id: "l1", primary: "Lead B", secondary: null }],
  };

  it("moves the active row with arrow keys and selects it with Enter", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/leads/l1");
  });

  it("clamps at the first row when ArrowUp is pressed with nothing above it", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/deals/d1");
  });

  it("clamps at the last row when ArrowDown is pressed past the end", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/leads/l1");
  });

  it("highlights the active row visually as the selection moves", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(screen.getByText("Lead B").closest("button")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Deal A").closest("button")).toHaveAttribute("aria-selected", "false");
  });

  it("resets the active index to the first row when the result set changes size", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    setResults({
      deals: [{ id: "d3", primary: "Only Deal", secondary: null }],
      people: [],
      organizations: [],
      leads: [],
    });
    fireEvent.change(input, { target: { value: "y" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/deals/d3");
  });

  it("resets the active index to the top when the results change content at the same length", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    setResults({
      deals: [{ id: "d9", primary: "New Deal", secondary: null }],
      people: [],
      organizations: [],
      leads: [{ id: "l9", primary: "New Lead", secondary: null }],
    });
    fireEvent.change(input, { target: { value: "y" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("New Deal").closest("button")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/deals/d9");
  });

  it("preserves Escape closing the palette", () => {
    setResults(MIXED_RESULTS);
    const input = openAndSearch("x");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
