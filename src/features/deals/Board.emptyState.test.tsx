// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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
      client: { deal: { board: { query: () => Promise.resolve({ cards: [] }) } } },
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

afterEach(cleanup);

const PIPE = "11111111-1111-1111-1111-111111111111";
const ANA = "22222222-2222-2222-2222-222222222222";
const BEN = "22222222-2222-2222-2222-222222222223";
const STAGES = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alpha", order: 0, rottingDays: null },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Beta", order: 1, rottingDays: null },
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
  card("d0000000-0000-0000-0000-000000000001", "Deal One"),
  card("d0000000-0000-0000-0000-000000000002", "Ben Deal", { ownerId: BEN, ownerName: "Ben" }),
];

const ROTTING: BoardViewState = {
  ownerId: null,
  sortKey: "title",
  sortDir: "asc",
  savedFilter: {
    id: "f1",
    name: "Rotting deals",
    favorite: false,
    isShared: false,
    isOwn: true,
    definition: { conditions: [{ field: "value", op: "gt", value: 999_999 }] },
  },
  conditions: null,
};

function renderBoard(cards: BoardCard[], initialView?: BoardViewState) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Board
        pipelineId={PIPE}
        selfActorId={ANA}
        stages={STAGES}
        cards={cards}
        pipelines={[{ id: PIPE, name: "Test pipeline", stages: [] }]}
        density="comfortable"
        serverNow={new Date("2026-06-01T00:00:00Z")}
        initialView={initialView}
      />
    </QueryClientProvider>,
  );
}

function stageList(): HTMLElement | null {
  return screen.queryByRole("list", { name: "Pipeline stages" });
}

// Board filter state survives a reload, so a filter that excludes every deal can greet a rep with
// five columns of nothing. The columns are machinery: replace them with the sentence that says why
// the board is blank, and the control that undoes it.
//
// The owner picker narrows on the client, so cards the server returned prove a filter is hiding
// them. That is the only case where the board asserts a filter is to blame.
const OWNER_BEN: BoardViewState = {
  ownerId: BEN,
  sortKey: "title",
  sortDir: "asc",
  savedFilter: null,
  conditions: null,
};

const ONLY_ANA = [CARDS[0]!];

describe("Board with a filter that provably excludes every deal", () => {
  test("replaces the stage columns with an empty state", () => {
    renderBoard(ONLY_ANA, OWNER_BEN);

    expect(screen.getByText("No deals match these filters")).not.toBeNull();
    expect(stageList()).toBeNull();
  });

  test("brings the columns back when the empty state's clear control is used", async () => {
    const user = userEvent.setup();
    renderBoard(ONLY_ANA, OWNER_BEN);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(stageList()).not.toBeNull();
    expect(screen.queryByText("No deals match these filters")).toBeNull();
  });
});

// A saved filter narrows server-side, so zero rows back is indistinguishable from a pipeline with
// nothing in it. Blaming the filter would promise deals that clearing it cannot produce.
describe("Board where the filter and an empty pipeline look the same", () => {
  test("claims neither cause and offers both ways out", () => {
    renderBoard([], ROTTING);

    const title = screen.getByText("Nothing to show here");
    expect(screen.queryByText("No deals match these filters")).toBeNull();
    // Scoped to the empty state: the add-deal control also lives in the toolbar above it.
    const panel = title.parentElement;
    if (panel === null) throw new Error("empty state has no container");
    const empty = within(panel);
    expect(empty.getByRole("button", { name: "Clear filters" })).not.toBeNull();
    expect(empty.getByRole("button", { name: /Deal/ })).not.toBeNull();
  });

  test("keeps the stage columns, since the pipeline may simply be empty", () => {
    renderBoard([], ROTTING);

    expect(stageList()).not.toBeNull();
  });
});

// An empty pipeline is a different sentence: nothing is being hidden, so the way out is adding a
// deal, and the stage columns stay because they are the drop targets a first deal lands in.
describe("Board with an empty, unfiltered pipeline", () => {
  test("says the pipeline is empty and keeps the stage columns", () => {
    renderBoard([]);

    expect(screen.getByText("No deals in this pipeline yet")).not.toBeNull();
    expect(stageList()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});

// The owner picker is the third narrowing dimension and it lives outside the Filter menu, so
// without a chip nothing on screen says the board is showing one person's deals.
describe("Board applied-filter chips", () => {
  test("names the owner the board is narrowed to", () => {
    renderBoard(CARDS, { ...ROTTING, savedFilter: null, ownerId: BEN });

    expect(screen.getByText("Owner: Ben")).not.toBeNull();
  });

  test("clears the owner too, so Clear all leaves the board unfiltered", async () => {
    const user = userEvent.setup();
    renderBoard(CARDS, { ...ROTTING, savedFilter: null, ownerId: BEN });

    expect(screen.queryByRole("button", { name: "Deal One" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("button", { name: "Deal One" })).not.toBeNull();
    expect(screen.queryByText("Owner: Ben")).toBeNull();
  });

  test("clears the owner from the Filter menu's Clear filter", async () => {
    const user = userEvent.setup();
    renderBoard(CARDS, { ...ROTTING, savedFilter: null, ownerId: BEN });

    await user.click(screen.getByLabelText("Filter"));
    await user.click(screen.getByRole("menuitem", { name: "Clear filter" }));

    expect(screen.getByRole("button", { name: "Deal One" })).not.toBeNull();
  });
});
