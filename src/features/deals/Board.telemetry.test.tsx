// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { baseCard } from "./dealCardTestFixture";

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock("@/features/observability/capture", () => ({
  capture: captureMock,
  currentRoute: () => "/pipeline/1",
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragCancel,
      onDragStart,
    }: {
      children?: ReactNode;
      onDragCancel?: () => void;
      onDragStart?: (event: { active: { id: string } }) => void;
    }) => (
      <div>
        <button type="button" onClick={() => onDragStart?.({ active: { id: "d1" } })}>
          Start drag
        </button>
        <button type="button" onClick={() => onDragCancel?.()}>
          Cancel drag
        </button>
        {children}
      </div>
    ),
    DragOverlay: () => null,
  };
});
vi.mock("./BoardStages", () => ({ BoardStages: () => null }));
vi.mock("./BoardToolbar", () => ({ BoardToolbar: () => null }));
vi.mock("./DragDropZones", () => ({ DragDropZones: () => null, zoneToStatus: () => null }));
vi.mock("./useBoardRealtime", () => ({ useBoardRealtime: () => {} }));
vi.mock("./useDealClose", () => ({ useDealClose: () => ({ close: vi.fn() }) }));
vi.mock("./useDealMove", () => ({
  BOARD_QUERY_KEY: (pipelineId: string) => ["board", pipelineId],
  useDealMove: () => ({ move: vi.fn() }),
}));
vi.mock("@/features/presence/ui/PresenceBar", () => ({ PresenceBar: () => null }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ client: { deal: { board: { query: vi.fn() } } } }),
    deal: { savedFilters: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));

import { Board } from "./Board";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("emits board_drag_cancelled on drag cancel", () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Board
        pipelineId="11111111-1111-1111-1111-111111111111"
        selfActorId="22222222-2222-2222-2222-222222222222"
        stages={[]}
        cards={[]}
        pipelines={[]}
        density="comfortable"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel drag" }));
  expect(captureMock).toHaveBeenCalledWith("board_drag_cancelled", { route: "/pipeline/1" });
});

it("emits board_drag_started with the card's current stage", () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Board
        pipelineId="11111111-1111-1111-1111-111111111111"
        selfActorId="22222222-2222-2222-2222-222222222222"
        stages={[{ id: "stage-1", name: "Inbox", order: 0, rottingDays: null }]}
        cards={[{ ...baseCard, id: "d1", stageId: "stage-1" }]}
        pipelines={[]}
        density="comfortable"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start drag" }));
  expect(captureMock).toHaveBeenCalledWith("board_drag_started", {
    route: "/pipeline/1",
    stageFrom: "stage-1",
  });
});
