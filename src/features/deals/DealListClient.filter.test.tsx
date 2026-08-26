// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Real @tanstack/react-query here (NOT mocked): the stale-rows bug lives in how initialData +
// staleTime interact with a changing queryKey, so the test must exercise the real cache.
const listQueryMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/pipeline/p/list",
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ client: { deal: { list: { query: listQueryMock } } } }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));
vi.mock("./DealList", () => ({ DealList: () => <div data-testid="deal-list" /> }));
vi.mock("./BoardToolbar", () => ({
  BoardToolbar: (p: { filterSlot: React.ReactNode }) => <div>{p.filterSlot}</div>,
}));
// The saved-filter menu owns "Clear filter"; expose it so the list's inline definition can be
// cleared from there, the way the board's toolbar does.
vi.mock("./BoardFilterControl", () => ({
  BoardFilterControl: (p: { onApplyDefinition?: (d: null) => void }) => (
    <button type="button" onClick={() => p.onApplyDefinition?.(null)}>
      menu-clear-filter
    </button>
  ),
}));
vi.mock("./BoardSortControl", () => ({ BoardSortControl: () => null }));
vi.mock("./NewDealButton", () => ({ NewDealButton: () => null }));

import { DealListClient } from "./DealListClient";

afterEach(() => {
  cleanup();
  listQueryMock.mockReset();
});

const initial = {
  pipelineId: "p1",
  stages: [{ id: "s1", name: "Qualified" }],
  pipelines: [{ id: "p1", name: "Sales", stages: [{ id: "s1", name: "Qualified" }] }],
  rows: [],
  total: 500,
  totalValue: "1000000.00",
};

function renderClient(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DealListClient initial={initial} />
    </QueryClientProvider>,
  );
}

describe("DealListClient inline filter", () => {
  it("fetches with the applied inline definition instead of serving stale unfiltered initialData", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    renderClient();

    // Apply "Title contains acme" via the inline builder (default field=title, first op=contains).
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(listQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          definition: {
            combinator: "and",
            conditions: [{ field: "title", op: "contains", value: "acme" }],
          },
        }),
      ),
    );
  });

  // The inline builder has to reopen on what the list is actually filtered by. An edit the user
  // walked away from is not applied, so showing it back misreports the list and the next Apply
  // silently commits it.
  it("reopens the inline builder on the applied conditions, dropping an abandoned edit", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    renderClient();

    const filterTrigger = (): HTMLElement => screen.getByRole("button", { name: "Filter" });
    fireEvent.click(filterTrigger());
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.queryByLabelText("Condition 1 value")).toBeNull());

    // Reopen, retype, then close without applying.
    fireEvent.click(filterTrigger());
    expect(screen.getByLabelText<HTMLInputElement>("Condition 1 value").value).toBe("acme");
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "corp" } });
    fireEvent.click(filterTrigger());
    await waitFor(() => expect(screen.queryByLabelText("Condition 1 value")).toBeNull());

    fireEvent.click(filterTrigger());
    expect(screen.getByLabelText<HTMLInputElement>("Condition 1 value").value).toBe("acme");
  });

  it("drops the applied conditions when the filter menu clears them", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    renderClient();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByLabelText("Filter")).toHaveTextContent("1"));

    fireEvent.click(screen.getByRole("button", { name: "menu-clear-filter" }));

    expect(screen.getByLabelText("Filter")).not.toHaveTextContent("1");
  });
});
