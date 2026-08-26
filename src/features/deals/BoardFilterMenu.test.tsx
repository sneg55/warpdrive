// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { BoardFilterMenu } from "./BoardFilterMenu";
import type { SavedFilterView as SavedFilter } from "./savedFilterView";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

const own: SavedFilter = {
  id: "f1",
  name: "Big deals",
  definition: { conditions: [] },
  isOwn: true,
  isShared: false,
  favorite: false,
};

const AD_HOC: FilterDefinition = {
  combinator: "and",
  conditions: [{ field: "title", op: "contains", value: "Acme" }],
};

function renderMenu(props: Partial<React.ComponentProps<typeof BoardFilterMenu>> = {}) {
  return render(<BoardFilterMenu {...props} />);
}

async function openMenu(
  props: Partial<React.ComponentProps<typeof BoardFilterMenu>> = {},
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderMenu(props);
  // The trigger names the applied filter ("Filter: Big deals"), so match on the prefix.
  await user.click(screen.getByRole("button", { name: /^Filter/ }));
  return user;
}

describe("BoardFilterMenu", () => {
  it("lists the saved filters and the create entry", async () => {
    await openMenu({ savedFilters: [own], onCreateFilter: () => {} });
    expect(screen.getByRole("menuitem", { name: "All open deals" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Big deals" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Create new filter/ })).not.toBeNull();
  });

  it("reports the picked saved filter", async () => {
    const onSelectFilter = vi.fn();
    const user = await openMenu({ savedFilters: [own], onSelectFilter });
    await user.click(screen.getByRole("menuitem", { name: "Big deals" }));
    expect(onSelectFilter).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }));
  });

  it("shows the applied ad-hoc condition count on the trigger", () => {
    renderMenu({ activeCount: 2 });
    expect(screen.getByLabelText("Filter")).toHaveTextContent("2");
  });

  it("opens the create-filter dialog from the create entry", async () => {
    const onCreateFilter = vi.fn();
    const user = await openMenu({ onCreateFilter });
    await user.click(screen.getByRole("menuitem", { name: /Create new filter/ }));
    expect(onCreateFilter).toHaveBeenCalledTimes(1);
  });
});

describe("BoardFilterMenu clear action", () => {
  it("offers Clear filter while an ad-hoc definition is applied", async () => {
    await openMenu({ appliedDefinition: AD_HOC, activeCount: 1 });
    expect(screen.getByRole("menuitem", { name: "Clear filter" })).not.toBeNull();
  });

  it("offers Clear filter while a saved filter is selected", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: "f1" });
    expect(screen.getByRole("menuitem", { name: "Clear filter" })).not.toBeNull();
  });

  it("hides Clear filter when nothing is applied", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: null, appliedDefinition: null });
    expect(screen.queryByRole("menuitem", { name: "Clear filter" })).toBeNull();
  });

  it("clears both the saved selection and the ad-hoc definition", async () => {
    const onSelectFilter = vi.fn();
    const onClearConditions = vi.fn();
    const user = await openMenu({
      savedFilters: [own],
      selectedFilterId: "f1",
      appliedDefinition: AD_HOC,
      onSelectFilter,
      onClearConditions,
    });
    await user.click(screen.getByRole("menuitem", { name: "Clear filter" }));
    expect(onSelectFilter).toHaveBeenCalledWith(null);
    expect(onClearConditions).toHaveBeenCalledTimes(1);
  });

  it("clears both from the All open deals row", async () => {
    const onSelectFilter = vi.fn();
    const onClearConditions = vi.fn();
    const user = await openMenu({ appliedDefinition: AD_HOC, onSelectFilter, onClearConditions });
    await user.click(screen.getByRole("menuitem", { name: "All open deals" }));
    expect(onSelectFilter).toHaveBeenCalledWith(null);
    expect(onClearConditions).toHaveBeenCalledTimes(1);
  });
});

describe("BoardFilterMenu current row", () => {
  it("marks All open deals current when nothing is applied", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: null, appliedDefinition: null });
    expect(screen.getByRole("menuitem", { name: "All open deals" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  // An ad-hoc filter leaves selectedFilterId null too, so keying the highlight off the id alone
  // claims "All open deals" while the board shows a filtered subset.
  it("does not mark All open deals current while an ad-hoc filter is applied", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: null, appliedDefinition: AD_HOC });
    expect(screen.getByRole("menuitem", { name: "All open deals" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks the selected saved filter current", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: "f1" });
    expect(screen.getByRole("menuitem", { name: "Big deals" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

describe("BoardFilterMenu create-filter entry", () => {
  it("offers Create new filter when no saved filter is selected", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: null, onCreateFilter: () => {} });
    expect(screen.getByRole("menuitem", { name: /Create new filter/ })).not.toBeNull();
  });

  it("offers Edit filter when the selected filter is the actor's own", async () => {
    await openMenu({ savedFilters: [own], selectedFilterId: "f1", onCreateFilter: () => {} });
    expect(screen.getByRole("menuitem", { name: /Edit filter/ })).not.toBeNull();
  });

  it("offers Save as a new filter for someone else's shared filter", async () => {
    const shared = { ...own, isOwn: false, isShared: true };
    await openMenu({ savedFilters: [shared], selectedFilterId: "f1", onCreateFilter: () => {} });
    expect(screen.getByRole("menuitem", { name: /Save as a new filter/ })).not.toBeNull();
  });
});

describe("BoardFilterMenu favorites", () => {
  it("orders favourited filters first", async () => {
    const starred = { ...own, id: "f2", name: "Rotting deals", favorite: true };
    await openMenu({ savedFilters: [own, starred] });
    const names = screen
      .getAllByRole("menuitem")
      .map((el) => el.textContent ?? "")
      .filter((t) => t === "Big deals" || t === "Rotting deals");
    expect(names).toEqual(["Rotting deals", "Big deals"]);
  });

  it("toggles a favourite without picking the filter", async () => {
    const onToggleFavorite = vi.fn();
    const onSelectFilter = vi.fn();
    const user = await openMenu({ savedFilters: [own], onToggleFavorite, onSelectFilter });
    await user.click(screen.getByRole("menuitem", { name: "Favorite filter" }));
    expect(onToggleFavorite).toHaveBeenCalledWith("f1");
    expect(onSelectFilter).not.toHaveBeenCalled();
  });
});

const shared: SavedFilter = { ...own, id: "f2", name: "Team deals", isOwn: false, isShared: true };

async function openDeleteConfirm(
  user: ReturnType<typeof userEvent.setup>,
  name = "Big deals",
): Promise<HTMLElement> {
  await user.click(screen.getByRole("menuitem", { name: `Delete ${name}` }));
  return await screen.findByRole("alertdialog");
}

describe("BoardFilterMenu delete", () => {
  it("offers delete on an owned filter and not on someone else's shared one", async () => {
    await openMenu({ savedFilters: [own, shared], onDeleteFilter: vi.fn() });
    expect(screen.getByRole("menuitem", { name: "Delete Big deals" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete Team deals" })).toBeNull();
  });

  it("offers no delete at all when the menu has no delete handler", async () => {
    await openMenu({ savedFilters: [own] });
    expect(screen.queryByRole("menuitem", { name: /^Delete / })).toBeNull();
  });

  it("names the filter in the confirmation and deletes nothing until it is confirmed", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    const onDeleteFilter = vi.fn();
    const onSelectFilter = vi.fn();
    const user = await openMenu({ savedFilters: [own], onDeleteFilter, onSelectFilter });

    const dialog = await openDeleteConfirm(user);

    expect(within(dialog).getByText(/"Big deals"/)).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(onDeleteFilter).not.toHaveBeenCalled();
    // Asking to delete a row must not also apply it to the board.
    expect(onSelectFilter).not.toHaveBeenCalled();
  });

  it("reports the delete once the confirmation is accepted", async () => {
    const onDeleteFilter = vi.fn();
    const user = await openMenu({ savedFilters: [own], onDeleteFilter });

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(onDeleteFilter).toHaveBeenCalledWith("f1");
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const onDeleteFilter = vi.fn();
    const user = await openMenu({ savedFilters: [own], onDeleteFilter });

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onDeleteFilter).not.toHaveBeenCalled();
  });

  // The row lives in a Radix menu: a delete that let the item select would close the menu and take
  // the dialog with it, so cancelling has to land back on the still-open list.
  it("keeps the menu open behind the confirmation", async () => {
    const user = await openMenu({ savedFilters: [own], onDeleteFilter: vi.fn() });

    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("menuitem", { name: "Big deals" })).toBeInTheDocument();
  });
});
