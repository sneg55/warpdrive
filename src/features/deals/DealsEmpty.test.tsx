// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import { DealsEmpty } from "./DealsEmpty";

afterEach(cleanup);

// The archive rendered a full header row, a footer and no sentence at all about what archiving is.
it("says what the archive is and offers the way back to the board", () => {
  render(
    <DealsEmpty
      variant="archived"
      pipelineId="p1"
      filtered={false}
      onClearFilters={vi.fn()}
      addSlot={<button type="button">+ Deal</button>}
    />,
  );

  const empty = screen.getByRole("status");
  expect(empty).toHaveTextContent(STRINGS.dealsList.emptyArchivedTitle);
  expect(empty).toHaveTextContent(STRINGS.dealsList.emptyArchivedBody);
  expect(screen.getByRole("link", { name: STRINGS.dealsList.emptyArchivedAction })).toHaveAttribute(
    "href",
    "/pipeline/p1",
  );
  // The archive is not where a deal is created, so it must not offer that.
  expect(screen.queryByRole("button", { name: "+ Deal" })).toBeNull();
});

it("offers the add-deal control on an empty list view", () => {
  render(
    <DealsEmpty
      variant="list"
      pipelineId="p1"
      filtered={false}
      onClearFilters={vi.fn()}
      addSlot={<button type="button">+ Deal</button>}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent(STRINGS.dealsList.emptyTitle);
  expect(screen.getByRole("button", { name: "+ Deal" })).toBeInTheDocument();
});

it("blames the filter, not the pipeline, when a filter emptied the view", () => {
  const onClearFilters = vi.fn();
  render(
    <DealsEmpty
      variant="archived"
      pipelineId="p1"
      filtered
      onClearFilters={onClearFilters}
      addSlot={null}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent(STRINGS.dealsList.emptyFilteredTitle);
  fireEvent.click(screen.getByRole("button", { name: STRINGS.dealsList.emptyFilteredAction }));
  expect(onClearFilters).toHaveBeenCalledOnce();
});
