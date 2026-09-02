// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// Real @tanstack/react-query and the real DealList/DealsEmpty: the question under test is which
// sentence the user ends up reading, so nothing between the filter and the copy is mocked.
const listQueryMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));
vi.mock("./BoardToolbar", () => ({
  BoardToolbar: (p: { filterSlot: React.ReactNode }) => <div>{p.filterSlot}</div>,
}));
vi.mock("./BoardFilterControl", () => ({ BoardFilterControl: () => null }));
vi.mock("./BoardSortControl", () => ({ BoardSortControl: () => null }));
vi.mock("./NewDealButton", () => ({ NewDealButton: () => <button type="button">+ Deal</button> }));

import { STRINGS } from "@/constants/strings";
import type { DealListRow } from "./DealList";
import { DealListClient } from "./DealListClient";

afterEach(() => {
  cleanup();
  listQueryMock.mockReset();
});

const row: DealListRow = {
  id: "d1",
  title: "Acme renewal",
  value: "1000.00",
  stageId: "s1",
  boardPosition: "a0",
  ownerId: "u1",
  personId: null,
  orgId: null,
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: "2026-06-01T00:00:00.000Z",
  customFields: {},
};

function renderClient(initial: { rows: DealListRow[]; total: number }): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DealListClient
        initial={{
          pipelineId: "p1",
          stages: [{ id: "s1", name: "Qualified" }],
          pipelines: [{ id: "p1", name: "Sales", stages: [{ id: "s1", name: "Qualified" }] }],
          rows: initial.rows,
          total: initial.total,
          totalValue: "1000.00",
        }}
      />
    </QueryClientProvider>,
  );
}

// Apply "Title contains zzz" through the real inline builder (default field=title, op=contains).
function applyFilter(): void {
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
  fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "zzz" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

it("blames the filter when the pipeline does hold deals the filter excluded", async () => {
  listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
  renderClient({ rows: [row], total: 1 });
  applyFilter();

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(STRINGS.dealsList.emptyFilteredBody),
  );
});

// An empty pipeline plus any active filter used to state that the pipeline still holds deals.
// It does not, and the exit it offered (clear the filter) would have changed nothing.
it("does not claim the pipeline holds deals when it holds none", async () => {
  listQueryMock.mockResolvedValue({ rows: [], total: 0, totalValue: "0" });
  renderClient({ rows: [], total: 0 });
  applyFilter();

  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  const empty = screen.getByRole("status");
  expect(empty).not.toHaveTextContent(STRINGS.dealsList.emptyFilteredBody);
  expect(empty).toHaveTextContent(STRINGS.dealsList.emptyBody);
});
