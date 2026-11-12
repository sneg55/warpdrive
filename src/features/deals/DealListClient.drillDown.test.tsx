// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listQueryMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/pipeline/p1/list",
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
vi.mock("./BoardFilterControl", () => ({
  BoardFilterControl: (p: { selectedFilterId: string | null }) => (
    <span data-testid="selected-filter">{p.selectedFilterId ?? "none"}</span>
  ),
}));
vi.mock("./BoardSortControl", () => ({ BoardSortControl: () => null }));
vi.mock("./NewDealButton", () => ({ NewDealButton: () => null }));

import { type BoardViewState, boardViewDefinition, DEFAULT_BOARD_VIEW } from "./boardView";
import { forgetBoardView, rememberBoardView } from "./boardViewMemory";
import { DealListClient } from "./DealListClient";
import { wonDealsDrillDownView } from "./wonDealsDrillDown";

afterEach(() => {
  cleanup();
  forgetBoardView();
  listQueryMock.mockReset();
});

const REMEMBERED: BoardViewState = {
  ...DEFAULT_BOARD_VIEW,
  savedFilter: {
    id: "f1",
    name: "Rotting deals",
    favorite: false,
    isShared: true,
    isOwn: false,
    definition: { combinator: "and", conditions: [], rotting: true },
  },
};

const DRILL = wonDealsDrillDownView(
  { owner: "all", from: "2026-03-01", to: "2026-03-31", pipelineId: "p1" },
  "u1",
);

describe("DealListClient opened from the Deals won tile", () => {
  it("shows the won-deals drill-down even after another view was used this session", async () => {
    rememberBoardView(REMEMBERED);
    listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DealListClient
          initial={{
            pipelineId: "p1",
            stages: [{ id: "s1", name: "Qualified" }],
            pipelines: [{ id: "p1", name: "Sales", stages: [] }],
            rows: [],
            total: 0,
            totalValue: "0",
            initialView: DRILL,
            fromDrillDown: true,
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("selected-filter")).toHaveTextContent("none");
    await waitFor(() =>
      expect(listQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({ definition: boardViewDefinition(DRILL) }),
      ),
    );
  });
});
