import { expect, it, vi } from "vitest";
import type { BoardViewPrefs } from "@/features/identity/preferencesSchema";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { boardViewDefinition, DEFAULT_BOARD_VIEW } from "./boardView";
import { resolveInitialBoardView } from "./initialBoardView";
import type { SavedFilterView } from "./savedFilterView";

const OWNER = "22222222-2222-4222-8222-222222222222";
const FILTER_ID = "33333333-3333-4333-8333-333333333333";
const definition: FilterDefinition = { conditions: [{ field: "value", op: "gt", value: 100 }] };
const savedFilter: SavedFilterView = {
  id: FILTER_ID,
  name: "Big deals",
  favorite: false,
  isShared: false,
  isOwn: true,
  definition,
};

it("falls back to the board defaults when nothing is stored", async () => {
  const load = vi.fn<() => Promise<SavedFilterView[]>>();
  expect(await resolveInitialBoardView({}, load)).toEqual(DEFAULT_BOARD_VIEW);
  expect(load).not.toHaveBeenCalled();
});

it("restores the owner filter and sort without reading saved filters", async () => {
  const load = vi.fn<() => Promise<SavedFilterView[]>>();
  const view = await resolveInitialBoardView(
    {
      boardView: {
        ownerId: OWNER,
        sortKey: "value",
        sortDir: "desc",
        savedFilterId: null,
        conditions: null,
      },
    },
    load,
  );
  expect(view).toMatchObject({ ownerId: OWNER, sortKey: "value", sortDir: "desc" });
  expect(load).not.toHaveBeenCalled();
});

it("resolves a stored saved-filter id to the filter the board must apply", async () => {
  const view = await resolveInitialBoardView(
    {
      boardView: {
        ownerId: null,
        sortKey: "title",
        sortDir: "asc",
        savedFilterId: FILTER_ID,
        conditions: null,
      },
    },
    () => Promise.resolve([savedFilter]),
  );
  expect(view.savedFilter).toEqual(savedFilter);
  expect(boardViewDefinition(view)).toEqual(definition);
});

it("drops a stored saved filter the actor can no longer see", async () => {
  const view = await resolveInitialBoardView(
    {
      boardView: {
        ownerId: null,
        sortKey: "title",
        sortDir: "asc",
        savedFilterId: FILTER_ID,
        conditions: null,
      },
    },
    () => Promise.resolve([]),
  );
  expect(view.savedFilter).toBeNull();
  expect(boardViewDefinition(view)).toBeUndefined();
});

it("ad-hoc conditions win over the saved view, matching the client precedence", async () => {
  // Typed as the stored pref, whose combinator zod has already filled in, not as the hand-built
  // FilterDefinition that leaves it optional.
  const adHoc: BoardViewPrefs["conditions"] = {
    combinator: "and",
    conditions: [{ field: "title", op: "contains", value: "a" }],
  };
  const view = await resolveInitialBoardView(
    {
      boardView: {
        ownerId: null,
        sortKey: "title",
        sortDir: "asc",
        savedFilterId: FILTER_ID,
        conditions: adHoc,
      },
    },
    () => Promise.resolve([savedFilter]),
  );
  expect(boardViewDefinition(view)).toEqual(adHoc);
});
