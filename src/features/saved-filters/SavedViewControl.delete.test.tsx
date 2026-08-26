// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedViewDefinition } from "./savedView";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const listData = vi.fn<() => unknown[]>(() => []);
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ savedFilters: { listByTarget: { invalidate } } }),
    savedFilters: { listByTarget: { useQuery: () => ({ data: listData() }) } },
  },
}));
const removeSavedFilterAction = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("./serverActions", () => ({
  createSavedFilterAction: vi.fn(),
  toggleFavoriteAction: vi.fn(),
  removeSavedFilterAction: (...a: unknown[]) => removeSavedFilterAction(...a),
}));
const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { SavedViewControl } from "./SavedViewControl";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  listData.mockReturnValue([]);
  removeSavedFilterAction.mockResolvedValue({ ok: true, value: undefined });
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

function renderControl(selectedViewId: string | null, onSelectView = vi.fn()) {
  render(
    <SavedViewControl
      targetEntity="person"
      allLabel="All people"
      currentDefinition={DEFINITION}
      selectedViewId={selectedViewId}
      onSelectView={onSelectView}
    />,
  );
  return onSelectView;
}

async function openDeleteConfirm(
  user: ReturnType<typeof userEvent.setup>,
  name = "Acme people",
): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: "Saved views" }));
  await user.click(screen.getByRole("menuitem", { name: `Delete ${name}` }));
  return await screen.findByRole("alertdialog");
}

describe("SavedViewControl delete", () => {
  it("offers delete on an owned view and not on someone else's shared one", async () => {
    listData.mockReturnValue([view(), view({ id: "v2", name: "Team view", isOwn: false })]);
    const user = userEvent.setup();
    renderControl(null);

    await user.click(screen.getByRole("button", { name: "Saved views" }));

    expect(screen.getByRole("menuitem", { name: "Delete Acme people" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete Team view" })).toBeNull();
  });

  it("names the view in the confirmation and deletes nothing until it is confirmed", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    const onSelectView = renderControl(null);

    const dialog = await openDeleteConfirm(user);

    expect(within(dialog).getByText(/"Acme people"/)).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(removeSavedFilterAction).not.toHaveBeenCalled();
    expect(onSelectView).not.toHaveBeenCalled();
  });

  it("removes the confirmed view and refreshes the list", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    renderControl(null);

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeSavedFilterAction).toHaveBeenCalledWith("v1", "csrf"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ targetEntity: "person" }));
  });

  it("clears the selection when the deleted view was the applied one", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    const onSelectView = renderControl("v1");

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onSelectView).toHaveBeenCalledWith(null));
  });

  it("leaves the selection alone when a different view is deleted", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    const onSelectView = renderControl("v9");

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeSavedFilterAction).toHaveBeenCalled());
    expect(onSelectView).not.toHaveBeenCalled();
  });

  it("reports a rejected delete instead of dropping it", async () => {
    listData.mockReturnValue([view()]);
    removeSavedFilterAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const user = userEvent.setup();
    const onSelectView = renderControl("v1");

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(onSelectView).not.toHaveBeenCalled();
  });

  it("deletes nothing when the confirmation is cancelled, and keeps the menu open", async () => {
    listData.mockReturnValue([view()]);
    const user = userEvent.setup();
    renderControl(null);

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(removeSavedFilterAction).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Acme people" })).toBeInTheDocument();
  });
});
