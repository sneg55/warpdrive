// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardFilterMenu } from "./BoardFilterMenu";

afterEach(cleanup);

const SAVED = [
  {
    id: "f1",
    name: "Rotting deals",
    favorite: false,
    isShared: false,
    isOwn: true,
    definition: { conditions: [] },
  },
];

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /Filter/ });
}

// The owner picker is a separate control, so this menu knows the board is narrowed to one owner
// only if it is told. Without that the trigger reads unfiltered and Clear filter leaves the board
// still filtered.
describe("BoardFilterMenu owner dimension", () => {
  it("marks the trigger filtered when only an owner is selected", () => {
    render(<BoardFilterMenu savedFilters={SAVED} ownerFiltered />);

    expect(trigger()).toHaveAttribute("data-filtered", "true");
  });

  it("offers Clear filter when an owner is the only thing narrowing the board", async () => {
    const user = userEvent.setup();
    render(<BoardFilterMenu savedFilters={SAVED} ownerFiltered />);

    await user.click(trigger());

    expect(screen.getByRole("menuitem", { name: "Clear filter" })).not.toBeNull();
  });

  it("clears the owner alongside the saved filter and the conditions", async () => {
    const onSelectFilter = vi.fn();
    const onClearConditions = vi.fn();
    const onClearOwner = vi.fn();
    const user = userEvent.setup();
    render(
      <BoardFilterMenu
        savedFilters={SAVED}
        selectedFilterId="f1"
        ownerFiltered
        onSelectFilter={onSelectFilter}
        onClearConditions={onClearConditions}
        onClearOwner={onClearOwner}
      />,
    );

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: "Clear filter" }));

    expect(onClearOwner).toHaveBeenCalled();
    expect(onSelectFilter).toHaveBeenCalledWith(null);
    expect(onClearConditions).toHaveBeenCalled();
  });
});
