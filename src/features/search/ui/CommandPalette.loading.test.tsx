// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, useQueryMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useQueryMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { search: { query: { useQuery: useQueryMock } } },
}));

import { STRINGS } from "@/constants/strings";
import { CommandPalette } from "./CommandPalette";
import { OPEN_SEARCH_EVENT } from "./events";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  pushMock.mockClear();
  useQueryMock.mockReset();
});

function typeQuery(text: string): void {
  render(<CommandPalette />);
  fireEvent(window, new Event(OPEN_SEARCH_EVENT));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: text } });
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

// "No organizations" for a query that has not resolved is how a rep ends up creating a duplicate
// record. Nothing zero-result may render until the search query has actually answered.
describe("CommandPalette loading state", () => {
  it("shows a searching skeleton, not the per-section empty copy, while the query is pending", () => {
    vi.useFakeTimers();
    useQueryMock.mockReturnValue({ data: undefined, error: null });
    typeQuery("Acme");
    expect(screen.getByRole("status", { name: /searching/i })).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.search.emptyOrganizations)).toBeNull();
    expect(screen.queryByText(STRINGS.search.emptyDeals)).toBeNull();
  });

  it("renders the empty copy once the query resolves with no results", () => {
    vi.useFakeTimers();
    useQueryMock.mockReturnValue({
      data: { deals: [], people: [], organizations: [], leads: [] },
      error: null,
    });
    typeQuery("Acme");
    expect(screen.getByText(STRINGS.search.emptyOrganizations)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /searching/i })).toBeNull();
  });

  it("reports a failed search as an error rather than as no results", () => {
    vi.useFakeTimers();
    useQueryMock.mockReturnValue({ data: undefined, error: { message: "boom" } });
    typeQuery("Acme");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.search.emptyOrganizations)).toBeNull();
  });
});
