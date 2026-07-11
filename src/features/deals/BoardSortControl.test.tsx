// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import { BoardSortControl } from "./BoardSortControl";

const SORT = STRINGS.board.sort;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

describe("BoardSortControl", () => {
  it("shows the selected option's label and lists every sort option when opened", () => {
    render(
      <BoardSortControl
        sortKey="title"
        direction="asc"
        onKeyChange={vi.fn()}
        onToggleDirection={vi.fn()}
      />,
    );
    const trigger = screen.getByLabelText(SORT.label);
    expect(trigger).toHaveTextContent(SORT.options.title);
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: SORT.options.nextActivity })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: SORT.options.owner })).toBeInTheDocument();
  });

  it("sort-field control is a branded Select that emits a BoardSortKey", () => {
    const onKeyChange = vi.fn();
    render(
      <BoardSortControl
        sortKey="nextActivity"
        direction="asc"
        onKeyChange={onKeyChange}
        onToggleDirection={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(SORT.label));
    fireEvent.click(screen.getByText(SORT.options.value));
    expect(onKeyChange).toHaveBeenCalledWith("value");
  });

  it("toggles direction and labels the button by the current direction", () => {
    const onToggleDirection = vi.fn();
    const { rerender } = render(
      <BoardSortControl
        sortKey="title"
        direction="asc"
        onKeyChange={vi.fn()}
        onToggleDirection={onToggleDirection}
      />,
    );
    // Ascending now: the button offers to sort descending.
    const btn = screen.getByRole("button", { name: "Sort descending" });
    fireEvent.click(btn);
    expect(onToggleDirection).toHaveBeenCalledTimes(1);

    rerender(
      <BoardSortControl
        sortKey="title"
        direction="desc"
        onKeyChange={vi.fn()}
        onToggleDirection={onToggleDirection}
      />,
    );
    expect(screen.getByRole("button", { name: "Sort ascending" })).toBeInTheDocument();
  });
});
