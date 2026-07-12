// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxFilter } from "@/features/email/emailReads";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/email/useInboxRealtime", () => ({ useInboxRealtime: () => {} }));
vi.mock("@/features/email/DraftsList", () => ({ DraftsList: () => null }));
vi.mock("@/features/email/OutboxList", () => ({ OutboxList: () => null }));

// InboxSearchBar stub: a button that fires a non-empty query (drives isSearching true).
vi.mock("@/features/email/InboxSearchBar", () => ({
  InboxSearchBar: ({ onQuery }: { onQuery: (q: string) => void }) => (
    <button type="button" onClick={() => onQuery("budget")}>
      run-search
    </button>
  ),
}));

// ThreadList stub: surfaces the quickFilter it receives and lets the test flip it, so we can assert
// InboxListClient feeds the active quick-filter into the search query input.
const threadListQuickFilters: (InboxFilter | undefined)[] = [];
vi.mock("@/features/email/ThreadList", () => ({
  ThreadList: ({
    quickFilter,
    onQuickFilterChange,
  }: {
    quickFilter?: InboxFilter;
    onQuickFilterChange?: (next: InboxFilter) => void;
  }) => {
    threadListQuickFilters.push(quickFilter);
    return (
      <button type="button" onClick={() => onQuickFilterChange?.("shared")}>
        set-shared
      </button>
    );
  },
}));

// Capture every input the search query is called with, across re-renders.
const searchCalls: { q: string; filter: InboxFilter }[] = [];
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      search: {
        useQuery: (input: { q: string; filter: InboxFilter }) => {
          searchCalls.push(input);
          return { data: [] };
        },
      },
    },
  },
}));

import { InboxListClient } from "./InboxListClient";

afterEach(() => {
  cleanup();
  searchCalls.length = 0;
  threadListQuickFilters.length = 0;
});

describe("InboxListClient search + quick filter", () => {
  it("feeds the active quick-filter into the search query and re-issues when it changes", () => {
    render(<InboxListClient selfActorId="u1" folder="inbox" />);

    // Activate search: the query now runs with the default quick-filter.
    fireEvent.click(screen.getByRole("button", { name: "run-search" }));
    expect(searchCalls.at(-1)).toEqual({ q: "budget", filter: "all" });

    // Selecting a quick-filter must re-issue the SAME search with that filter applied.
    fireEvent.click(screen.getByRole("button", { name: "set-shared" }));
    expect(searchCalls.at(-1)).toEqual({ q: "budget", filter: "shared" });
  });

  it("passes the active quick-filter down to ThreadList", () => {
    render(<InboxListClient selfActorId="u1" folder="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: "set-shared" }));
    expect(threadListQuickFilters.at(-1)).toBe("shared");
  });
});
