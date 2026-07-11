// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { applyMove, type BoardData } from "./boardCache";
import type { BoardCard } from "./dealRepo";
import { BOARD_QUERY_KEY } from "./useDealMove";

beforeAll(() => {
  // BoardSortControl's field picker is a Radix Select; jsdom lacks these APIs.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

// Board pulls in realtime (WebSocket) and presence collaborators that are out of scope for
// "does the board render from the live query cache". Stub them so the test stays focused.
vi.mock("./useBoardRealtime", () => ({ useBoardRealtime: () => {} }));
vi.mock("@/features/presence/ui/PresenceBar", () => ({ PresenceBar: () => null }));
// Cards navigate via useRouter on click; provide a router outside an app-router context.
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

import { Board } from "./Board";

afterEach(cleanup);

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

function renderBoard(initialCards: BoardCard[]) {
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
      />
    </QueryClientProvider>,
  );
  return qc;
}

describe("Board stage header", () => {
  // Pipedrive prefixes each stage's value/count line with a small balance/scale glyph. Assert
  // the header renders that metric icon so the value line reads like Pipedrive, not plain text.
  test("renders a metric icon before the stage value line", () => {
    renderBoard([card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1")]);
    const alpha = screen.getByRole("region", { name: "Alpha" });
    expect(alpha.querySelector("[data-stage-metric-icon]")).not.toBeNull();
  });
});

describe("Board stage lanes", () => {
  // Pipedrive renders every stage as an equal-height gray lane, so an empty stage reads as a
  // column you can drop into rather than barren white space. Our columns were transparent and
  // collapsed to header height when empty. Each stage region must carry a lane background and a
  // min-height so it stays a visible lane even with zero cards.
  test("renders an empty stage as a filled, non-collapsing lane", () => {
    // Only Alpha has a card; Beta is empty and must still render as a lane.
    renderBoard([card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1")]);
    const beta = screen.getByRole("region", { name: "Beta" });
    expect(beta.className).toContain("bg-muted/40");
    expect(beta.className).toMatch(/min-h-/);
  });

  // With only a few stages the board should fill the width (columns grow) rather than leaving a
  // large empty right half. The GROWING element must be the flex item itself (the <li> that wraps
  // each column), not the inner section, or flex-grow has no effect and columns sit at min-width.
  test("stage columns grow to fill the board width", () => {
    renderBoard([]);
    const alpha = screen.getByRole("region", { name: "Alpha" });
    const flexItem = alpha.parentElement;
    expect(flexItem?.className).toMatch(/flex-1\b/);
    expect(flexItem?.className).toMatch(/min-w-/);
  });
});

describe("Board live query subscription", () => {
  // Reproduces the reported bug: after a drag/move, the card did not visibly relocate until
  // an F5. Root cause: Board rendered from static props while the optimistic update wrote to
  // the BOARD_QUERY_KEY cache no component read. The board must render from that cache so a
  // cache write (optimistic move or realtime event) immediately re-renders the card.
  test("relocates a card when the board query cache is updated (no reload)", async () => {
    const c = card("dddddddd-0000-0000-0000-000000000009", "Card One", STAGES[0]!.id, "1");
    const qc = renderBoard([c]);

    // Initially the card lives in the Alpha column, not Beta.
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

    // Simulate the optimistic move writing to the shared cache.
    act(() => {
      const prev = qc.getQueryData<BoardData>(BOARD_QUERY_KEY(PIPE)) ?? { cards: [c] };
      qc.setQueryData<BoardData>(
        BOARD_QUERY_KEY(PIPE),
        applyMove(prev, { dealId: c.id, toStageId: STAGES[1]!.id, boardPosition: "2" }),
      );
    });

    // The card must now render under Beta without any reload. waitFor covers React Query's
    // asynchronous observer notification after setQueryData.
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
  // Titles that never collide with the stage region names ("Alpha"/"Beta").
  function sortCard(id: string, title: string, over: Partial<BoardCard>): BoardCard {
    return { ...card(id, title, STAGES[0]!.id, "1"), ...over };
  }

  // DOM order of the deal cards inside a stage region, read via each card's aria-label (= title).
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
    // Earliest next activity first; the null-activity card sinks to the bottom.
    expect(cardOrder("Alpha")).toEqual(["Deal Two", "Deal One", "Deal Three"]);
  });

  test("re-sorts the column when a different sort field is chosen", () => {
    renderBoard(CARDS);
    fireEvent.click(screen.getByLabelText("Sort by"));
    fireEvent.click(screen.getByText("Deal value"));
    // By value ascending: 100, 200, 300 (a different order than the next-activity default,
    // proving the control drives the per-column sort).
    expect(cardOrder("Alpha")).toEqual(["Deal Two", "Deal Three", "Deal One"]);
  });
});
