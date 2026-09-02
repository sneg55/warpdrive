// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { refresh, reportError, bulkStageAction, invalidateQueries } = vi.hoisted(() => ({
  refresh: vi.fn(),
  reportError: vi.fn(),
  bulkStageAction: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { initialData: unknown }) => ({ data: opts.initialData }),
  useQueryClient: () => ({ invalidateQueries }),
  keepPreviousData: Symbol("keepPreviousData"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/pipeline/p/list",
}));
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ client: {} }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));
vi.mock("./bulkStageAction", () => ({ bulkStageAction }));

let listProps: DealListProps | undefined;
vi.mock("./DealList", () => ({
  DealList: (p: DealListProps) => {
    listProps = p;
    return <div data-testid="deal-list" />;
  },
}));
vi.mock("./BoardToolbar", () => ({ BoardToolbar: () => null }));
vi.mock("./BoardFilterControl", () => ({ BoardFilterControl: () => null }));
vi.mock("./BoardSortControl", () => ({ BoardSortControl: () => null }));
vi.mock("./NewDealButton", () => ({ NewDealButton: () => null }));

import type { DealListProps } from "./DealList";
import { DealListClient } from "./DealListClient";
import { DEAL_LIST_QUERY_ROOT } from "./dealListQueryKey";

const row = {
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
  customFields: {},
};

const initial = {
  pipelineId: "p1",
  stages: [
    { id: "s1", name: "Qualified" },
    { id: "s2", name: "Proposal" },
  ],
  pipelines: [{ id: "p1", name: "Sales", stages: [{ id: "s1", name: "Qualified" }] }],
  rows: [row, { ...row, id: "d2" }],
  total: 2,
  totalValue: "50000.00",
};

describe("DealListClient bulk stage wiring", () => {
  it("invalidates the deal-list read so the moved rows show their new stage", async () => {
    bulkStageAction.mockResolvedValue({ ok: true, rows: [] });
    render(<DealListClient initial={initial} />);

    const applied = await listProps?.onBulkStage(["d1", "d2"], "s2");

    expect(bulkStageAction).toHaveBeenCalledWith(
      { dealIds: ["d1", "d2"], toStageId: "s2" },
      "csrf",
    );
    expect(applied).toBe(true);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [DEAL_LIST_QUERY_ROOT] });
    expect(refresh).toHaveBeenCalled();
  });

  it("leaves the cached rows alone and reports the error when the move fails", async () => {
    bulkStageAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    render(<DealListClient initial={initial} />);

    const applied = await listProps?.onBulkStage(["d1", "d2"], "s2");

    expect(applied).toBe(false);
    expect(reportError).toHaveBeenCalledWith("E_PERM_001");
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
