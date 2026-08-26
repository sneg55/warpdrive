// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { BoardCard } from "./dealRepo";

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
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
  },
}));
const setBoardView = vi.fn<(view: unknown, csrf?: string | null) => Promise<{ ok: true }>>(() =>
  Promise.resolve({ ok: true }),
);
vi.mock("@/features/identity/preferencesActions", () => ({
  setBoardViewAction: (view: unknown, csrf?: string | null) => setBoardView(view, csrf),
}));

import { Board } from "./Board";
import type { BoardViewState } from "./boardView";

afterEach(() => {
  cleanup();
  setBoardView.mockClear();
});

const PIPE = "11111111-1111-1111-1111-111111111111";
const ANA = "22222222-2222-2222-2222-222222222222";
const BEN = "22222222-2222-2222-2222-222222222223";
const STAGES = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alpha", order: 0, rottingDays: null },
];

function card(id: string, title: string, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    title,
    value: "100.00",
    stageId: STAGES[0]!.id,
    boardPosition: "1",
    ownerId: ANA,
    ownerName: "Ana",
    personId: null,
    orgId: null,
    nextActivityAt: null,
    lastActivityAt: null,
    stageEnteredAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

const CARDS = [
  card("d0000000-0000-0000-0000-000000000001", "Deal One", { value: "300" }),
  card("d0000000-0000-0000-0000-000000000002", "Deal Two", { value: "100" }),
  card("d0000000-0000-0000-0000-000000000003", "Ben Deal", {
    value: "200",
    ownerId: BEN,
    ownerName: "Ben",
  }),
];

function renderBoard(initialView?: BoardViewState) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <Board
        pipelineId={PIPE}
        selfActorId={ANA}
        stages={STAGES}
        cards={CARDS}
        pipelines={[{ id: PIPE, name: "Test pipeline", stages: [] }]}
        density="comfortable"
        serverNow={new Date("2026-06-01T00:00:00Z")}
        initialView={initialView}
      />
    </QueryClientProvider>,
  );
  return utils;
}

function cardOrder(): string[] {
  const region = screen.getByRole("region", { name: "Alpha" });
  return Array.from(region.querySelectorAll("[data-deal-id]")).map(
    (el) => el.getAttribute("aria-label") ?? "",
  );
}

describe("board toolbar view restored from the saved preference", () => {
  test("seeds the sort field and direction from the persisted view", () => {
    renderBoard({
      ownerId: null,
      sortKey: "value",
      sortDir: "desc",
      savedFilter: null,
      conditions: null,
    });
    expect(screen.getByLabelText("Sort by")).toHaveTextContent("Deal value");
    expect(cardOrder()).toEqual(["Deal One", "Ben Deal", "Deal Two"]);
  });

  test("seeds the owner filter from the persisted view", () => {
    renderBoard({
      ownerId: BEN,
      sortKey: "title",
      sortDir: "asc",
      savedFilter: null,
      conditions: null,
    });
    expect(screen.getByText("Ben")).toBeDefined();
    expect(cardOrder()).toEqual(["Ben Deal"]);
  });

  test("seeds the ad-hoc filter count from the persisted view", () => {
    renderBoard({
      ownerId: null,
      sortKey: "title",
      sortDir: "asc",
      savedFilter: null,
      conditions: { conditions: [{ field: "value", op: "gt", value: 150 }] },
    });
    expect(screen.getByLabelText("Filter")).toHaveTextContent("1");
  });

  test("reopens the ad-hoc builder on the applied conditions and combinator", async () => {
    const user = userEvent.setup();
    renderBoard({
      ownerId: null,
      sortKey: "title",
      sortDir: "asc",
      savedFilter: null,
      conditions: {
        combinator: "or",
        conditions: [
          { field: "title", op: "contains", value: "One" },
          { field: "title", op: "contains", value: "Two" },
        ],
      },
    });
    await user.click(screen.getByLabelText("Filter"));
    await user.click(screen.getByRole("menuitem", { name: /Create new filter/ }));
    expect(screen.getAllByLabelText(/Condition \d+ field/)).toHaveLength(2);
    expect(screen.getByLabelText("Match combinator")).toHaveTextContent("any condition");
  });

  test("clears the applied ad-hoc filter from the Filter menu", async () => {
    const user = userEvent.setup();
    renderBoard({
      ownerId: null,
      sortKey: "title",
      sortDir: "asc",
      savedFilter: null,
      conditions: { conditions: [{ field: "value", op: "gt", value: 150 }] },
    });
    await user.click(screen.getByLabelText("Filter"));
    await user.click(screen.getByRole("menuitem", { name: "Clear filter" }));
    expect(screen.getByLabelText("Filter")).not.toHaveTextContent("1");
  });
});

describe("board toolbar view saved when a control changes", () => {
  test("persists the chosen sort field", async () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText("Sort by"));
    fireEvent.click(screen.getByText("Deal value"));
    await waitFor(() => expect(setBoardView).toHaveBeenCalled());
    expect(setBoardView.mock.calls.at(-1)?.[0]).toMatchObject({ sortKey: "value" });
  });

  test("persists the sort direction toggle", async () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText("Sort descending"));
    await waitFor(() => expect(setBoardView).toHaveBeenCalled());
    expect(setBoardView.mock.calls.at(-1)?.[0]).toMatchObject({ sortDir: "desc" });
  });

  test("persists the owner filter", async () => {
    renderBoard();
    fireEvent.click(screen.getByText("Everyone"));
    fireEvent.click(await screen.findByText("Ben"));
    await waitFor(() => expect(setBoardView).toHaveBeenCalled());
    expect(setBoardView.mock.calls.at(-1)?.[0]).toMatchObject({ ownerId: BEN });
  });

  test("does not write a preference on first render", async () => {
    renderBoard({
      ownerId: BEN,
      sortKey: "value",
      sortDir: "desc",
      savedFilter: null,
      conditions: null,
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(setBoardView).not.toHaveBeenCalled();
  });
});
