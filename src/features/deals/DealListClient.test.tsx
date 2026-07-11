// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// useQuery is seeded with initialData by the component; mock it to hand that back synchronously so
// the render reflects the SSR page without spinning up a QueryClientProvider.
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { initialData: unknown }) => ({ data: opts.initialData }),
  keepPreviousData: Symbol("keepPreviousData"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/pipeline/p/list",
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ client: {} }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));

// DealList is presentational; stub it to surface the footer inputs it receives.
vi.mock("./DealList", () => ({
  DealList: (p: { total: number; totalValue: string }) => (
    <div data-testid="deal-list">
      total:{p.total} value:{p.totalValue}
    </div>
  ),
}));
// Toolbar just renders its slots; expose the filter slot so the owner filter is reachable.
vi.mock("./BoardToolbar", () => ({
  BoardToolbar: (p: { filterSlot: React.ReactNode }) => <div>{p.filterSlot}</div>,
}));
vi.mock("./BoardFilterControl", () => ({
  BoardFilterControl: (p: { onSelectOwner: (id: string) => void }) => (
    <button type="button" onClick={() => p.onSelectOwner("u1")}>
      filter-owner-u1
    </button>
  ),
}));
vi.mock("./BoardSortControl", () => ({ BoardSortControl: () => null }));
vi.mock("./NewDealButton", () => ({ NewDealButton: () => null }));

import { DealListClient, resolveDealListFooter } from "./DealListClient";

const rowU1 = {
  id: "d1",
  title: "Acme renewal",
  value: "25000.00",
  stageId: "s1",
  boardPosition: "1",
  ownerId: "u1",
  personId: null,
  orgId: null,
  ownerName: "User A",
  orgName: "Acme Inc",
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-24T00:00:00Z"),
  updatedAt: "2026-06-24T00:00:00Z",
};
const rowU2 = { ...rowU1, id: "d2", ownerId: "u2", ownerName: "User B", value: "5000.00" };

// The SSR page loads only the first slice of rows but the server reports the true pipeline total.
const initial = {
  pipelineId: "p1",
  stages: [{ id: "s1", name: "Qualified" }],
  pipelines: [{ id: "p1", name: "Sales", stages: [{ id: "s1", name: "Qualified" }] }],
  rows: [rowU1, rowU2],
  total: 500,
  totalValue: "1000000.00",
};

describe("resolveDealListFooter", () => {
  it("reports the server total/value when no client-side filter is active (even past loaded rows)", () => {
    expect(
      resolveDealListFooter({
        filtered: false,
        serverTotal: 500,
        serverTotalValue: "1000000.00",
        filteredCount: 2,
        filteredValue: "30000.00",
      }),
    ).toEqual({ total: 500, totalValue: "1000000.00", filtered: false });
  });

  it("reports the filtered count/value and flags filtered when a client-side filter is active", () => {
    expect(
      resolveDealListFooter({
        filtered: true,
        serverTotal: 500,
        serverTotalValue: "1000000.00",
        filteredCount: 1,
        filteredValue: "25000.00",
      }),
    ).toEqual({ total: 1, totalValue: "25000.00", filtered: true });
  });
});

describe("DealListClient footer count", () => {
  it("shows the server pipeline total when unfiltered, not the loaded row count", () => {
    render(<DealListClient initial={initial} />);
    // Two rows are loaded, but the honest pipeline total is 500.
    expect(screen.getByTestId("deal-list")).toHaveTextContent("total:500");
    expect(screen.getByTestId("deal-list")).toHaveTextContent("value:1000000.00");
    // No filtered indicator while unfiltered.
    expect(screen.queryByLabelText("filtered count")).not.toBeInTheDocument();
  });

  it("shows the filtered count distinctly (with a filtered label) when an owner filter is active", () => {
    render(<DealListClient initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "filter-owner-u1" }));
    // Only User A's single deal survives the owner filter.
    expect(screen.getByTestId("deal-list")).toHaveTextContent("total:1");
    // A distinct, unambiguous "filtered" indicator makes clear this is not the whole pipeline.
    const indicator = screen.getByLabelText("filtered count");
    expect(indicator).toHaveTextContent("1");
    expect(indicator.textContent?.toLowerCase()).toContain("filtered");
    // The misleading whole-pipeline denominator (500) must NOT appear: the filtered subset count and
    // the server total are computed over different bases, so "1 of 500" is meaningless.
    expect(indicator).not.toHaveTextContent("500");
  });
});
