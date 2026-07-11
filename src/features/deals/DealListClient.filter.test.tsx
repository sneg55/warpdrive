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
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));
vi.mock("./DealList", () => ({ DealList: () => <div data-testid="deal-list" /> }));
vi.mock("./BoardToolbar", () => ({
  BoardToolbar: (p: { filterSlot: React.ReactNode }) => <div>{p.filterSlot}</div>,
}));
vi.mock("./BoardFilterControl", () => ({ BoardFilterControl: () => null }));
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

    // Apply "Title is acme" via the inline builder (default field=title, op=eq).
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(listQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          definition: { conditions: [{ field: "title", op: "eq", value: "acme" }] },
        }),
      ),
    );
  });
});
