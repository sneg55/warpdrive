// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { applyMove, type BoardData } from "./boardCache";
import type { BoardCard } from "./dealRepo";
import { BOARD_QUERY_KEY } from "./useDealMove";

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
      client: { deal: { board: { query: vi.fn() } } },
      deal: { savedFilters: { invalidate: vi.fn() } },
    }),
    deal: { savedFilters: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/features/identity/preferencesActions", () => ({
  setBoardViewAction: () => Promise.resolve({ ok: true }),
}));

import { Board } from "./Board";
import { forgetBoardView } from "./boardViewMemory";

afterEach(() => {
  cleanup();
  forgetBoardView();
});

const PIPE = "11111111-1111-1111-1111-111111111111";

function card(id: string, title: string, stageId: string, boardPosition: string): BoardCard {
  return {
    id,
    title,
    value: "1000.00",
    stageId,
    boardPosition,
    ownerId: "22222222-2222-2222-2222-222222222222",
    personId: null,
    orgId: null,
    nextActivityAt: null,
    lastActivityAt: null,
    stageEnteredAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

const STAGES = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alpha", order: 0, rottingDays: null },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Beta", order: 1, rottingDays: null },
];

function renderBoard(initialCards: BoardCard[], baseCurrency = "USD") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Board
        pipelineId={PIPE}
        selfActorId="22222222-2222-2222-2222-222222222222"
        stages={STAGES}
        cards={initialCards}
        pipelines={[{ id: PIPE, name: "Test pipeline", stages: [] }]}
        density="comfortable"
        serverNow={new Date("2026-06-01T00:00:00Z")}
        baseCurrency={baseCurrency}
      />
    </QueryClientProvider>,
  );
  return qc;
}

describe("Board currency", () => {
  test("renders card values and stage totals in the instance base currency", () => {
    renderBoard(
      [card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1")],
      "EUR",
    );
    const alpha = screen.getByRole("region", { name: "Alpha" });
    expect(alpha.textContent).toContain("€1,000");
    expect(alpha.textContent).not.toContain("$");
  });
});

describe("Board stage header", () => {
  test("renders a metric icon before the stage value line", () => {
    renderBoard([card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1")]);
    const alpha = screen.getByRole("region", { name: "Alpha" });
    expect(alpha.querySelector("[data-stage-metric-icon]")).not.toBeNull();
  });
});

describe("Board stage lanes", () => {
  test("renders an empty stage as a filled, non-collapsing lane", () => {
    renderBoard([card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1")]);
    const beta = screen.getByRole("region", { name: "Beta" });
    expect(beta.className).toContain("bg-muted/40");
    expect(beta.className).toMatch(/min-h-/);
  });

  test("stage columns grow to fill the board width", () => {
    renderBoard([]);
    const alpha = screen.getByRole("region", { name: "Alpha" });
    const flexItem = alpha.parentElement;
    expect(flexItem?.className).toMatch(/flex-1\b/);
    expect(flexItem?.className).toMatch(/min-w-/);
  });
});

describe("Board live query subscription", () => {
  test("relocates a card when the board query cache is updated (no reload)", async () => {
    const c = card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1");
    const qc = renderBoard([c]);

    expect(
      within(screen.getByRole("region", { name: "Alpha" })).queryByRole("button", {
        name: "Card One",
      }),
    ).not.toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Beta" })).queryByRole("button", {
        name: "Card One",
      }),
    ).toBeNull();

    act(() => {
      const prev = qc.getQueryData<BoardData>(BOARD_QUERY_KEY(PIPE)) ?? { cards: [c] };
      qc.setQueryData<BoardData>(
        BOARD_QUERY_KEY(PIPE),
        applyMove(prev, { dealId: c.id, toStageId: STAGES[1]!.id, boardPosition: "2" }),
      );
    });

    await waitFor(() => {
      expect(
        within(screen.getByRole("region", { name: "Beta" })).queryByRole("button", {
          name: "Card One",
        }),
      ).not.toBeNull();
    });
    expect(
      within(screen.getByRole("region", { name: "Alpha" })).queryByRole("button", {
        name: "Card One",
      }),
    ).toBeNull();
  });
});

describe("Board column sorting", () => {
  function sortCard(id: string, title: string, over: Partial<BoardCard>): BoardCard {
    return { ...card(id, title, STAGES[0]!.id, "1"), ...over };
  }

  function cardOrder(stageName: string): string[] {
    const region = screen.getByRole("region", { name: stageName });
    return Array.from(region.querySelectorAll("[data-deal-id]")).map(
      (el) => el.getAttribute("aria-label") ?? "",
    );
  }

  const CARDS = [
    sortCard("d0000000-0000-0000-0000-000000000001", "Deal One", {
      nextActivityAt: new Date("2026-06-03T00:00:00Z"),
      value: "300",
    }),
    sortCard("d0000000-0000-0000-0000-000000000002", "Deal Two", {
      nextActivityAt: new Date("2026-06-01T00:00:00Z"),
      value: "100",
    }),
    sortCard("d0000000-0000-0000-0000-000000000003", "Deal Three", {
      nextActivityAt: null,
      value: "200",
    }),
  ];

  test("renders each column sorted by the default sort (next activity asc, empties last)", () => {
    renderBoard(CARDS);
    expect(cardOrder("Alpha")).toEqual(["Deal Two", "Deal One", "Deal Three"]);
  });

  test("re-sorts the column when a different sort field is chosen", () => {
    renderBoard(CARDS);
    fireEvent.click(screen.getByLabelText("Sort by"));
    fireEvent.click(screen.getByText("Deal value"));
    expect(cardOrder("Alpha")).toEqual(["Deal Two", "Deal Three", "Deal One"]);
  });
});
