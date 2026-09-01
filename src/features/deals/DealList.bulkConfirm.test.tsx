// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Radix Select and AlertDialog both use pointer capture + scrollIntoView, which jsdom lacks.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("./useInlineEdit", () => ({
  useInlineEdit: () => ({ editCell: vi.fn() }),
}));

import { DealList, type DealListRow } from "./DealList";
import { DEAL_LIST_COLUMNS } from "./dealListColumns";

afterEach(cleanup);

function makeRow(i: number): DealListRow {
  return {
    id: `d${i}`,
    title: `Deal ${i}`,
    value: "1000.00",
    stageId: "s1",
    boardPosition: `${i}`,
    ownerId: "u1",
    personId: null,
    orgId: null,
    ownerName: "User A",
    orgName: null,
    nextActivityAt: null,
    lastActivityAt: null,
    stageEnteredAt: new Date("2026-06-24T00:00:00Z"),
    updatedAt: "2026-06-24T00:00:00Z",
  };
}

const rows = [makeRow(1), makeRow(2), makeRow(3)];

function baseProps(onBulkStage: (ids: string[], to: string) => Promise<boolean>) {
  return {
    pipelineId: "p1",
    rows,
    total: rows.length,
    totalValue: "3000.00",
    stages: [
      { id: "s1", name: "Qualified" },
      { id: "s2", name: "Proposal" },
    ],
    onBulkStage,
    visibleColumns: DEAL_LIST_COLUMNS.filter((c) => c.defaultVisible === true),
  };
}

// Select every row, then pick a destination stage. Stops short of confirming.
function selectAllAndPick(stageName: string): void {
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all deals" }));
  fireEvent.click(screen.getByLabelText("Move to stage"));
  fireEvent.click(screen.getByRole("option", { name: stageName }));
}

describe("DealList bulk stage move", () => {
  it("moves nothing until the move is confirmed", () => {
    const onBulkStage = vi.fn(() => Promise.resolve(true));
    render(<DealList {...baseProps(onBulkStage)} />);

    selectAllAndPick("Proposal");

    expect(onBulkStage).not.toHaveBeenCalled();
  });

  it("names how many deals move and where they land", () => {
    render(<DealList {...baseProps(() => Promise.resolve(true))} />);

    selectAllAndPick("Proposal");

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("3 deals");
    expect(dialog).toHaveTextContent("Proposal");
  });

  it("keeps the selection and moves nothing when the move is cancelled", () => {
    const onBulkStage = vi.fn(() => Promise.resolve(true));
    render(<DealList {...baseProps(onBulkStage)} />);

    selectAllAndPick("Proposal");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onBulkStage).not.toHaveBeenCalled();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("performs the move once confirmed", async () => {
    const onBulkStage = vi.fn(() => Promise.resolve(true));
    render(<DealList {...baseProps(onBulkStage)} />);

    selectAllAndPick("Proposal");
    fireEvent.click(screen.getByRole("button", { name: "Move deals" }));

    await vi.waitFor(() => expect(onBulkStage).toHaveBeenCalledWith(["d1", "d2", "d3"], "s2"));
  });
});
