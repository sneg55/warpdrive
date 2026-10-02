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
vi.mock("@/features/identity/preferencesActions", () => ({
  setColumnViewAction: vi.fn(),
  setBoardViewAction: () => Promise.resolve({ ok: true }),
}));
vi.mock("./DealList", () => ({ DealList: () => <div data-testid="deal-list" /> }));
vi.mock("./BoardToolbar", () => ({
  BoardToolbar: (p: { filterSlot: React.ReactNode }) => <div>{p.filterSlot}</div>,
}));
// The saved-filter menu owns "Clear filter"; expose it so the list's inline definition can be
// cleared from there, the way the board's toolbar does.
vi.mock("./BoardFilterControl", () => ({
  BoardFilterControl: (p: {
    selectedFilterId: string | null;
    onApplyDefinition?: (d: null) => void;
  }) => (
    <>
      <span data-testid="selected-filter">{p.selectedFilterId ?? "none"}</span>
      <button type="button" onClick={() => p.onApplyDefinition?.(null)}>
        menu-clear-filter
      </button>
    </>
  ),
}));
vi.mock("./BoardSortControl", () => ({ BoardSortControl: () => null }));
vi.mock("./NewDealButton", () => ({ NewDealButton: () => null }));

import type { BoardViewState } from "./boardView";
import { forgetBoardView } from "./boardViewMemory";
import { DealListClient } from "./DealListClient";

afterEach(() => {
  cleanup();
  forgetBoardView();
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

function renderClient(over: Partial<typeof initial> & { initialView?: BoardViewState } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DealListClient initial={{ ...initial, ...over }} />
    </QueryClientProvider>,
  );
}

const ROTTING_VIEW: BoardViewState = {
  ownerId: null,
  sortKey: "nextActivity",
  sortDir: "asc",
  savedFilter: {
    id: "f1",
    name: "Rotting deals",
    favorite: false,
    isShared: true,
    isOwn: false,
    definition: { combinator: "and", conditions: [], rotting: true },
  },
  conditions: null,
};

function applyAcme(): void {
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
  fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

describe("DealListClient shares the persisted board view", () => {
  it("seeds the saved filter from the stored view and trusts the SSR rows fetched for it", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    renderClient({ initialView: ROTTING_VIEW, total: 0 });

    expect(screen.getByTestId("selected-filter")).toHaveTextContent("f1");
    await new Promise((r) => setTimeout(r, 50));
    expect(listQueryMock).not.toHaveBeenCalled();
  });

  it("refetches a stored date filter with the browser zone instead of trusting the server zone", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    renderClient({
      total: 0,
      initialView: {
        ...ROTTING_VIEW,
        savedFilter: null,
        conditions: {
          combinator: "and",
          conditions: [{ field: "nextActivityAt", op: "eq", value: "today" }],
        },
      },
    });

    await waitFor(() =>
      expect(listQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({ timeZone: expect.any(String) }),
      ),
    );
  });

  it("completes a first page that is shorter than its total", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    renderClient({ initialView: ROTTING_VIEW, rows: [], total: 80 });

    await waitFor(() =>
      expect(listQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({ definition: ROTTING_VIEW.savedFilter?.definition }),
      ),
    );
  });

  it("keeps an applied inline filter across a remount seeded from the unfiltered page", async () => {
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    const first = renderClient();
    applyAcme();
    await waitFor(() => expect(screen.getByLabelText("Filter")).toHaveTextContent("1"));
    first.unmount();
    listQueryMock.mockClear();

    renderClient();
    expect(screen.getByLabelText("Filter")).toHaveTextContent("1");
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
});

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
