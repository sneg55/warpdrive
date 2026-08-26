// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedViewDefinition } from "./savedView";

const listData = vi.fn<() => unknown[]>(() => []);
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ savedFilters: { listByTarget: { invalidate } } }),
    savedFilters: { listByTarget: { useQuery: () => ({ data: listData() }) } },
  },
}));
const createSavedFilterAction = vi.fn();
const toggleFavoriteAction = vi.fn();
// removeSavedFilterAction is stubbed even though nothing here deletes: the factory replaces the
// whole module, so a delete added to this file would otherwise fail on an undefined import.
vi.mock("./serverActions", () => ({
  createSavedFilterAction: (...a: unknown[]) => createSavedFilterAction(...a),
  toggleFavoriteAction: (...a: unknown[]) => toggleFavoriteAction(...a),
  removeSavedFilterAction: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { SavedViewControl } from "./SavedViewControl";

afterEach(() => {
  cleanup();
  listData.mockReturnValue([]);
  createSavedFilterAction.mockReset();
  toggleFavoriteAction.mockReset();
  invalidate.mockReset();
});

const DEFINITION: SavedViewDefinition = {
  combinator: "and",
  conditions: [{ field: "primaryEmail", op: "contains", value: "acme" }],
};

function view(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    name: "Acme people",
    favorite: false,
    isShared: false,
    isOwn: true,
    definition: DEFINITION,
    ...overrides,
  };
}

function renderControl(
  onSelectView = vi.fn(),
  currentDefinition: SavedViewDefinition | null = DEFINITION,
) {
  render(
    <SavedViewControl
      targetEntity="person"
      allLabel="All people"
      currentDefinition={currentDefinition}
      selectedViewId={null}
      onSelectView={onSelectView}
    />,
  );
  return onSelectView;
}

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Saved views" }));
}

describe("SavedViewControl", () => {
  it("lists the entity's saved views and reports the picked one", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    const onSelectView = renderControl();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Acme people" }));

    expect(onSelectView).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
  });

  it("clears the applied view from the all-records row", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    const onSelectView = renderControl();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "All people" }));

    expect(onSelectView).toHaveBeenCalledWith(null);
  });

  it("saves the applied conditions as a view for this entity", async () => {
    createSavedFilterAction.mockResolvedValue({ ok: true, value: { id: "new-1" } });
    const user = userEvent.setup();
    const onSelectView = renderControl();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Save current view/ }));
    await user.type(screen.getByLabelText("View name"), "Acme people");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(createSavedFilterAction).toHaveBeenCalledWith(
      {
        name: "Acme people",
        targetEntity: "person",
        definition: DEFINITION,
        isShared: false,
      },
      "csrf",
    );
    expect(onSelectView).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-1", name: "Acme people" }),
    );
  });

  it("offers no save when nothing is applied", async () => {
    const user = userEvent.setup();
    renderControl(vi.fn(), null);

    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: /Save current view/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("surfaces a rejected save instead of dropping it", async () => {
    createSavedFilterAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const user = userEvent.setup();
    const onSelectView = renderControl();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Save current view/ }));
    await user.type(screen.getByLabelText("View name"), "Shared people");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
    expect(onSelectView).not.toHaveBeenCalled();
  });

  it("opens a real menu, so arrow keys and type-ahead work", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    renderControl();

    await openMenu(user);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Acme people" })).toBeInTheDocument();
  });

  it("marks the all-records row current only when nothing is applied", async () => {
    const user = userEvent.setup();
    renderControl(vi.fn(), null);

    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: "All people" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("does not claim all records while an ad-hoc filter is applied", async () => {
    const user = userEvent.setup();
    renderControl();

    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: "All people" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("names the new view through the design-system Input", async () => {
    const user = userEvent.setup();
    renderControl();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Save current view/ }));

    expect(screen.getByLabelText("View name")).toHaveClass("focus-visible:ring-ring/50");
  });

  it("toggles the shared box by clicking its visible text", async () => {
    const user = userEvent.setup();
    renderControl();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Save current view/ }));
    await user.click(screen.getByText("Shared with everyone"));

    expect(screen.getByRole("checkbox", { name: "Shared with everyone" })).toBeChecked();
  });

  it("toggles the favorite star on an owned view only", async () => {
    listData.mockReturnValue([view(), view({ id: "v2", name: "Team view", isOwn: false })]);
    toggleFavoriteAction.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    renderControl();

    await openMenu(user);
    expect(screen.getAllByRole("menuitem", { name: /favorite view/i })).toHaveLength(1);
    await user.click(screen.getByRole("menuitem", { name: /favorite view/i }));

    expect(toggleFavoriteAction).toHaveBeenCalledWith("v1", "csrf");
  });
});
