// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BoardStages } from "./BoardStages";
import type { BoardCard } from "./dealRepo";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/pipeline",
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));

afterEach(cleanup);

const PIPE = "11111111-1111-1111-1111-111111111111";
const STAGES = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alpha", order: 0, rottingDays: null },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Beta", order: 1, rottingDays: null },
  { id: "cccccccc-0000-0000-0000-000000000003", name: "Gamma", order: 2, rottingDays: null },
];

function card(id: string, stageId: string): BoardCard {
  return {
    id,
    title: `Deal ${id}`,
    value: "100.00",
    stageId,
    boardPosition: "1",
    ownerId: "22222222-2222-2222-2222-222222222222",
    ownerName: "Ana",
    ownerAvatarUrl: null,
    personName: null,
    orgName: null,
    labels: [],
    nextActivityAt: null,
    lastActivityAt: null,
    personId: null,
    orgId: null,
    stageEnteredAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function renderStages(cards: BoardCard[]): void {
  const sortedByStage = new Map<string, BoardCard[]>();
  for (const s of STAGES) {
    sortedByStage.set(
      s.id,
      cards.filter((c) => c.stageId === s.id),
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DndContext id="test-board">
        <BoardStages
          stages={STAGES}
          sumsByStage={new Map()}
          sortedByStage={sortedByStage}
          density="comfortable"
          now={new Date("2026-01-01T00:00:00Z")}
          pipelineId={PIPE}
          pipelines={[
            { id: PIPE, name: "Demo", stages: STAGES.map((s) => ({ id: s.id, name: s.name })) },
          ]}
          baseCurrency="USD"
        />
      </DndContext>
    </QueryClientProvider>,
  );
}

describe("BoardStages layout", () => {
  test("every lane after the first carries a divider between columns", () => {
    renderStages([]);
    const items = screen
      .getByRole("list", { name: "Pipeline stages" })
      .querySelectorAll(":scope > li");
    expect(items).toHaveLength(3);
    expect(items[0]?.getAttribute("data-column-divider")).toBeNull();
    expect(items[1]?.getAttribute("data-column-divider")).toBe("true");
    expect(items[2]?.getAttribute("data-column-divider")).toBe("true");
  });

  test("a lane scrolls its own deals so the lane stays a drop target at any scroll offset", () => {
    renderStages([card("d1", STAGES[0]!.id), card("d2", STAGES[0]!.id)]);
    const lane = screen.getByRole("region", { name: "Alpha" });
    expect(lane.className).toContain("overflow-hidden");
    const deals = screen.getByRole("list", { name: "Alpha deals" });
    expect(deals.className).toContain("overflow-y-auto");
    expect(deals.className).toContain("flex-1");
  });
});
