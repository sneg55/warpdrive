// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterDefinition } from "@/features/saved-filters/schemas";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const savedFiltersData = vi.fn<() => unknown[]>(() => []);
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { savedFilters: { invalidate } } }),
    deal: { savedFilters: { useQuery: () => ({ data: savedFiltersData() }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
  },
}));
const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
const removeSavedFilterAction = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/features/saved-filters/serverActions", () => ({
  toggleFavoriteAction: vi.fn(),
  createSavedFilterAction: vi.fn(),
  removeSavedFilterAction: (...a: unknown[]) => removeSavedFilterAction(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { BoardFilterControl } from "./BoardFilterControl";

afterEach(() => {
  cleanup();
  savedFiltersData.mockReturnValue([]);
});

beforeEach(() => {
  vi.clearAllMocks();
  removeSavedFilterAction.mockResolvedValue({ ok: true, value: undefined });
});

const OR_DEFINITION: FilterDefinition = {
  combinator: "or",
  conditions: [
    { field: "title", op: "contains", value: "Acme" },
    { field: "title", op: "contains", value: "Corp" },
  ],
};

function savedRow(definition: FilterDefinition) {
  return {
    id: "f1",
    name: "Acme or Corp",
    favorite: false,
    isShared: false,
    isOwn: true,
    definition,
  };
}

function renderControl(
  selectedFilterId: string | null,
  props: Partial<React.ComponentProps<typeof BoardFilterControl>> = {},
) {
  return render(
    <BoardFilterControl
      owners={[{ ownerId: "u1", name: "Ada King" }]}
      stages={[{ id: "s1", name: "Qualified" }]}
      selectedOwnerId={null}
      onSelectOwner={() => {}}
      selectedFilterId={selectedFilterId}
      onSelectFilter={() => {}}
      {...props}
    />,
  );
}

// The menu entry is named for what the dialog will do, so it reads "Edit filter" once a saved
// filter the actor owns is selected.
async function openBuilder(
  user: ReturnType<typeof userEvent.setup>,
  entry: RegExp = /Create new filter/,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: /^Filter/ }));
  await user.click(screen.getByRole("menuitem", { name: entry }));
}

describe("BoardFilterControl", () => {
  it("seeds the builder with the selected saved filter's conditions and combinator", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const user = userEvent.setup();
    renderControl("f1");

    await openBuilder(user, /Edit filter/);

    expect(screen.getAllByLabelText(/Condition \d+ field/)).toHaveLength(2);
    expect(screen.getByLabelText("Match combinator")).toHaveTextContent("any condition");
  });

  it("opens a blank builder when no saved filter is selected", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const user = userEvent.setup();
    renderControl(null);

    await openBuilder(user);

    expect(screen.getAllByLabelText(/Condition \d+ field/)).toHaveLength(1);
    expect(screen.queryByLabelText("Match combinator")).toBeNull();
  });
});

describe("BoardFilterControl menu split", () => {
  it("keeps saved filters out of the owner dropdown", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const user = userEvent.setup();
    renderControl(null);

    await user.click(screen.getByRole("button", { name: /Owner: Everyone/ }));

    expect(screen.queryByText("Acme or Corp")).toBeNull();
    expect(screen.queryByText("All open deals")).toBeNull();
  });

  it("lists the saved filters in the Filter menu", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const user = userEvent.setup();
    renderControl(null);

    await user.click(screen.getByRole("button", { name: /^Filter/ }));

    expect(screen.getByRole("menuitem", { name: "Acme or Corp" })).not.toBeNull();
  });

  it("clears the saved filter and the ad-hoc definition from Clear filter", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const onSelectFilter = vi.fn();
    const onApplyDefinition = vi.fn();
    const user = userEvent.setup();
    renderControl("f1", { onSelectFilter, onApplyDefinition, appliedDefinition: OR_DEFINITION });

    await user.click(screen.getByRole("button", { name: /^Filter/ }));
    await user.click(screen.getByRole("menuitem", { name: "Clear filter" }));

    expect(onSelectFilter).toHaveBeenCalledWith(null);
    expect(onApplyDefinition).toHaveBeenCalledWith(null);
  });

  it("applies the built conditions ad-hoc from the builder", async () => {
    const onApplyDefinition = vi.fn();
    const user = userEvent.setup();
    renderControl(null, { onApplyDefinition });

    await openBuilder(user);
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [{ field: "title", op: "contains", value: "acme" }],
      }),
    );
  });

  // The board reads inlineDefinition ?? savedFilter.definition, so leaving both set shows the
  // ad-hoc edits while the menu still marks the saved row current.
  it("drops the saved selection when ad-hoc edits are applied over it", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const onSelectFilter = vi.fn();
    const onApplyDefinition = vi.fn();
    const user = userEvent.setup();
    renderControl("f1", { onSelectFilter, onApplyDefinition });

    await openBuilder(user, /Edit filter/);
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyDefinition).toHaveBeenCalled();
    expect(onSelectFilter).toHaveBeenCalledWith(null);
  });
});

// Opens the Filter menu, asks to delete the row and accepts the confirmation.
async function confirmDelete(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // The trigger names the applied filter ("Filter: Acme or Corp"), so match its prefix.
  await user.click(screen.getByRole("button", { name: /^Filter/ }));
  await user.click(screen.getByRole("menuitem", { name: "Delete Acme or Corp" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
}

describe("BoardFilterControl delete", () => {
  it("removes the confirmed saved filter and refreshes the list", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const user = userEvent.setup();
    renderControl(null);

    await confirmDelete(user);

    await waitFor(() => expect(removeSavedFilterAction).toHaveBeenCalledWith("f1", "csrf"));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it("clears the selection when the deleted filter was the applied one", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const onSelectFilter = vi.fn();
    const user = userEvent.setup();
    renderControl("f1", { onSelectFilter });

    await confirmDelete(user);

    await waitFor(() => expect(onSelectFilter).toHaveBeenCalledWith(null));
  });

  it("leaves the selection alone when a different filter is deleted", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    const onSelectFilter = vi.fn();
    const user = userEvent.setup();
    renderControl("f9", { onSelectFilter });

    await confirmDelete(user);

    await waitFor(() => expect(removeSavedFilterAction).toHaveBeenCalled());
    expect(onSelectFilter).not.toHaveBeenCalled();
  });

  it("reports a rejected delete instead of dropping it", async () => {
    savedFiltersData.mockReturnValue([savedRow(OR_DEFINITION)]);
    removeSavedFilterAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const onSelectFilter = vi.fn();
    const user = userEvent.setup();
    renderControl("f1", { onSelectFilter });

    await confirmDelete(user);

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(onSelectFilter).not.toHaveBeenCalled();
  });
});
