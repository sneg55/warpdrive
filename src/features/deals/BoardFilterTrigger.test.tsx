// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { BoardFilterMenu } from "./BoardFilterMenu";
import type { SavedFilterView as SavedFilter } from "./savedFilterView";

afterEach(cleanup);

const ROTTING: SavedFilter = {
  id: "f1",
  name: "Rotting deals",
  definition: { conditions: [] },
  isOwn: true,
  isShared: false,
  favorite: true,
};

const AD_HOC: FilterDefinition = {
  combinator: "and",
  conditions: [{ field: "title", op: "contains", value: "Acme" }],
};

// The board's filter survives a reload, so the trigger is the only thing on screen that can
// explain why a rep is looking at 2 of 33 deals. Reading a bare "Filter" while a filter is
// applied is the whole bug.
describe("board filter trigger", () => {
  it("reads plain Filter when nothing is applied", () => {
    render(<BoardFilterMenu savedFilters={[ROTTING]} />);
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("names the applied saved filter", () => {
    render(<BoardFilterMenu savedFilters={[ROTTING]} selectedFilterId="f1" />);
    expect(screen.getByRole("button", { name: "Filter: Rotting deals" })).toBeInTheDocument();
  });

  it("marks itself active while a filter is applied", () => {
    render(<BoardFilterMenu savedFilters={[ROTTING]} selectedFilterId="f1" />);
    expect(screen.getByRole("button", { name: /^Filter:/ })).toHaveAttribute(
      "data-filtered",
      "true",
    );
  });

  it("is not marked active with no filter applied", () => {
    render(<BoardFilterMenu savedFilters={[ROTTING]} />);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveAttribute(
      "data-filtered",
      "false",
    );
  });

  it("stays active for an ad-hoc filter that has no saved name", () => {
    render(<BoardFilterMenu appliedDefinition={AD_HOC} activeCount={1} />);
    expect(screen.getByRole("button", { name: /Filter/ })).toHaveAttribute("data-filtered", "true");
  });
});
