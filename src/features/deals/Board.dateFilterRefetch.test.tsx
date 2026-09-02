// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { BoardCard } from "./dealRepo";

const boardQuery = vi.hoisted(() => vi.fn(() => Promise.resolve({ cards: [] })));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("./useBoardRealtime", () => ({ useBoardRealtime: () => {} }));
vi.mock("@/features/presence/ui/PresenceBar", () => ({ PresenceBar: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/pipeline",
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      client: { deal: { board: { query: boardQuery } } },
      deal: { savedFilters: { invalidate: vi.fn() } },
    }),
    deal: { savedFilters: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("@/features/identity/preferencesActions", () => ({
  setBoardViewAction: () => Promise.resolve({ ok: true }),
}));

import { Board } from "./Board";
import type { BoardViewState } from "./boardView";

afterEach(() => {
  cleanup();
  boardQuery.mockClear();
});

const PIPE = "11111111-1111-1111-1111-111111111111";
const ANA = "22222222-2222-2222-2222-222222222222";
const STAGES = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alpha", order: 0, rottingDays: null },
];
const CARD: BoardCard = {
  id: "d0000000-0000-0000-0000-000000000001",
  title: "Deal One",
  value: "100.00",
  stageId: STAGES[0]?.id ?? "",
  boardPosition: "1",
  ownerId: ANA,
  ownerName: "Ana",
  personId: null,
  orgId: null,
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

function renderBoard(conditions: BoardViewState["conditions"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Board
        pipelineId={PIPE}
        selfActorId={ANA}
        stages={STAGES}
        cards={[CARD]}
        pipelines={[{ id: PIPE, name: "Test pipeline", stages: [] }]}
        density="comfortable"
        serverNow={new Date("2026-06-01T00:00:00Z")}
        initialView={{
          ownerId: null,
          sortKey: "title",
          sortDir: "asc",
          savedFilter: null,
          conditions,
        }}
      />
    </QueryClientProvider>,
  );
}

describe("board restored with a persisted filter", () => {
  test("refetches on mount with the browser zone when the filter has a date condition", async () => {
    renderBoard({ conditions: [{ field: "nextActivityAt", op: "eq", value: "today" }] });
    await waitFor(() => expect(boardQuery).toHaveBeenCalled());
    expect(boardQuery).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: PIPE, timeZone: expect.any(String) }),
    );
  });

  test("keeps the server-rendered cards without a refetch for a non-date filter", async () => {
    renderBoard({ conditions: [{ field: "value", op: "gt", value: 50 }] });
    await new Promise((r) => setTimeout(r, 50));
    expect(boardQuery).not.toHaveBeenCalled();
  });
});
