// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { BoardFilterMenu } from "./BoardFilterMenu";
import type { SavedFilterView } from "./savedFilterView";

afterEach(cleanup);

function savedRow(id: string, name: string): SavedFilterView {
  return {
    id,
    name,
    favorite: false,
    isShared: false,
    isOwn: true,
    definition: { conditions: [] },
  };
}

const SAVED = [savedRow("f1", "Rotting deals")];

// An ad-hoc set of conditions, the shape Board passes as appliedDefinition.
const INLINE = { match: "all", conditions: [] } as unknown as FilterDefinition;

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /Filter/ });
}

// Board and DealListClient both resolve `inlineDefinition ?? savedFilter?.definition`, so an
// ad-hoc definition wins over a selected saved filter. The trigger is the only thing explaining
// why the board shows a subset, so it must not name a filter that is not the one filtering.
describe("BoardFilterMenu trigger", () => {
  it("names the saved filter when that filter is what is applied", () => {
    render(<BoardFilterMenu savedFilters={SAVED} selectedFilterId="f1" />);

    expect(trigger()).toHaveTextContent("Filter: Rotting deals");
  });

  it("does not name a saved filter that an ad-hoc definition has overridden", () => {
    render(
      <BoardFilterMenu savedFilters={SAVED} selectedFilterId="f1" appliedDefinition={INLINE} />,
    );

    expect(trigger()).not.toHaveTextContent("Rotting deals");
  });

  it("keeps a long filter name from widening the toolbar out of reach", () => {
    const long = "Q3 enterprise renewals in EMEA owned by the west team and closing this quarter";
    render(<BoardFilterMenu savedFilters={[savedRow("f1", long)]} selectedFilterId="f1" />);

    // The visible label is capped, while the accessible name keeps the whole thing.
    expect(trigger().textContent ?? "").not.toContain(long);
    expect(trigger()).toHaveAccessibleName(`Filter: ${long}`);
  });
});
