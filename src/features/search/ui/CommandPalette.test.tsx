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

import { STRINGS } from "@/constants/strings";
import type { SearchResults } from "@/types/search";
import { CommandPalette, SearchResultsList } from "./CommandPalette";
import { OPEN_SEARCH_EVENT } from "./events";

const EMPTY_RESULTS: SearchResults = { deals: [], people: [], organizations: [], leads: [] };

// Sets the data the mocked trpc.search.query.useQuery hook returns on its
// next call. The mock ignores its input args, so tests only need to control
// the shape of the response, not the query string routing.
function setResults(results: SearchResults) {
  useQueryMock.mockReturnValue({ data: results });
}

beforeEach(() => {
  pushMock.mockClear();
  setResults(EMPTY_RESULTS);
});

describe("SearchResultsList", () => {
  it("renders sectioned results and a no-results note per empty section", () => {
    render(
      <SearchResultsList
        results={{
          deals: [{ id: "d1", primary: "Acme renewal", secondary: "25000" }],
          people: [],
          organizations: [{ id: "o1", primary: "Acme Inc", secondary: "acme.com" }],
          leads: [],
        }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Acme renewal")).toBeInTheDocument();
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText(STRINGS.search.emptyPeople)).toBeInTheDocument();
  });

  it("shows all four empty notes when results are empty", () => {
    render(
      <SearchResultsList
        results={{ deals: [], people: [], organizations: [], leads: [] }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(STRINGS.search.emptyDeals)).toBeInTheDocument();
    expect(screen.getByText(STRINGS.search.emptyPeople)).toBeInTheDocument();
    expect(screen.getByText(STRINGS.search.emptyOrganizations)).toBeInTheDocument();
    expect(screen.getByText(STRINGS.search.emptyLeads)).toBeInTheDocument();
  });

  it("calls onSelect with the correct kind and result when a deal button is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SearchResultsList
        results={{
          deals: [{ id: "d1", primary: "Big deal", secondary: null }],
          people: [],
          organizations: [],
          leads: [],
        }}
        onSelect={onSelect}
      />,
    );
    screen.getByText("Big deal").click();
    expect(onSelect).toHaveBeenCalledWith("deal", {
      id: "d1",
      primary: "Big deal",
      secondary: null,
    });
  });

  it("renders leads in their own section and calls onSelect with kind lead", () => {
    const onSelect = vi.fn();
    render(
      <SearchResultsList
        results={{
          deals: [],
          people: [],
          organizations: [],
          leads: [{ id: "l1", primary: "Zephyr expansion", secondary: null }],
        }}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText(STRINGS.search.headingLeads)).toBeInTheDocument();
    screen.getByText("Zephyr expansion").click();
    expect(onSelect).toHaveBeenCalledWith("lead", {
      id: "l1",
      primary: "Zephyr expansion",
      secondary: null,
    });
  });

  it("exposes listbox semantics on the results container", () => {
    render(
      <SearchResultsList
        results={{
          deals: [{ id: "d1", primary: "Acme renewal", secondary: null }],
          people: [],
          organizations: [],
          leads: [],
        }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("listbox", { name: STRINGS.search.resultsLabel })).toBeInTheDocument();
  });

  it("marks the row matching activeId as aria-selected and leaves others unselected", () => {
    render(
      <SearchResultsList
        results={{
          deals: [{ id: "d1", primary: "Deal A", secondary: null }],
          people: [],
          organizations: [],
          leads: [{ id: "l1", primary: "Lead B", secondary: null }],
        }}
        activeId="l1"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Lead B").closest("button")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Deal A").closest("button")).toHaveAttribute("aria-selected", "false");
  });
});

describe("CommandPalette", () => {
  it("renders a Leads section and navigates to the lead detail route on click", () => {
    vi.useFakeTimers();
    setResults({
      deals: [],
      people: [],
      organizations: [],
      leads: [{ id: "l1", primary: "Zephyr expansion", secondary: null }],
    });
    render(<CommandPalette />);
    fireEvent(window, new Event(OPEN_SEARCH_EVENT));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "Zephyr" },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText(STRINGS.search.headingLeads)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Zephyr expansion"));
    expect(pushMock).toHaveBeenCalledWith("/leads/l1");
  });
});
