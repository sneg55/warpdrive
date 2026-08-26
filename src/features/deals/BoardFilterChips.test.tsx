// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardFilterChips } from "./BoardFilterChips";

afterEach(cleanup);

function renderChips(props: Partial<React.ComponentProps<typeof BoardFilterChips>> = {}) {
  return render(
    <BoardFilterChips
      ownerName={null}
      savedFilterName={null}
      conditionCount={0}
      onClearOwner={() => {}}
      onClearSavedFilter={() => {}}
      onClearConditions={() => {}}
      onClearAll={() => {}}
      {...props}
    />,
  );
}

// The board narrows on three independent dimensions and the trigger can name only one of them, so
// the chip row is where each applied dimension is visible and separately removable.
describe("BoardFilterChips", () => {
  it("renders nothing when the board is not narrowed", () => {
    const { container } = renderChips();

    expect(container).toBeEmptyDOMElement();
  });

  it("names each applied narrowing dimension", () => {
    renderChips({ ownerName: "Ben", savedFilterName: "Rotting deals", conditionCount: 2 });

    expect(screen.getByText("Owner: Ben")).not.toBeNull();
    expect(screen.getByText("Filter: Rotting deals")).not.toBeNull();
    expect(screen.getByText("2 conditions")).not.toBeNull();
  });

  it("reads a single condition in the singular", () => {
    renderChips({ conditionCount: 1 });

    expect(screen.getByText("1 condition")).not.toBeNull();
  });

  it("dismisses one dimension without touching the others", async () => {
    const onClearOwner = vi.fn();
    const onClearSavedFilter = vi.fn();
    const user = userEvent.setup();
    renderChips({
      ownerName: "Ben",
      savedFilterName: "Rotting deals",
      onClearOwner,
      onClearSavedFilter,
    });

    await user.click(screen.getByRole("button", { name: "Remove owner filter" }));

    expect(onClearOwner).toHaveBeenCalled();
    expect(onClearSavedFilter).not.toHaveBeenCalled();
  });

  it("dismisses the ad-hoc conditions on their own", async () => {
    const onClearConditions = vi.fn();
    const user = userEvent.setup();
    renderChips({ ownerName: "Ben", conditionCount: 3, onClearConditions });

    await user.click(screen.getByRole("button", { name: "Remove conditions" }));

    expect(onClearConditions).toHaveBeenCalled();
  });

  it("clears every dimension from one control", async () => {
    const onClearAll = vi.fn();
    const user = userEvent.setup();
    renderChips({ ownerName: "Ben", conditionCount: 1, onClearAll });

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onClearAll).toHaveBeenCalled();
  });
});
