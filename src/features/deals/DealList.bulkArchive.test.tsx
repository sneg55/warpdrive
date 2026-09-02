// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
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
    customFields: {},
  };
}

const rows = [makeRow(1), makeRow(2), makeRow(3)];

function baseProps(onBulkArchive?: (ids: string[]) => Promise<boolean>) {
  return {
    pipelineId: "p1",
    rows,
    total: rows.length,
    totalValue: "3000.00",
    stages: [
      { id: "s1", name: "Qualified" },
      { id: "s2", name: "Proposal" },
    ],
    onBulkStage: vi.fn(() => Promise.resolve(true)),
    onBulkArchive,
    visibleColumns: DEAL_LIST_COLUMNS.filter((c) => c.defaultVisible === true),
    currency: "USD",
  };
}

function selectAll(): void {
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all deals" }));
}

describe("DealList bulk archive", () => {
  it("shows no Archive control until rows are selected", () => {
    render(<DealList {...baseProps(() => Promise.resolve(true))} />);

    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();

    selectAll();

    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("shows no Archive control when no onBulkArchive handler is given", () => {
    render(<DealList {...baseProps(undefined)} />);

    selectAll();

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("archives nothing until the archive is confirmed, and names the count", () => {
    const onBulkArchive = vi.fn(() => Promise.resolve(true));
    render(<DealList {...baseProps(onBulkArchive)} />);

    selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(onBulkArchive).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("3 deals");
  });

  it("keeps the selection and archives nothing when cancelled", () => {
    const onBulkArchive = vi.fn(() => Promise.resolve(true));
    render(<DealList {...baseProps(onBulkArchive)} />);

    selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onBulkArchive).not.toHaveBeenCalled();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("archives the selected ids once confirmed and clears the selection on success", async () => {
    const onBulkArchive = vi.fn(() => Promise.resolve(true));
    render(<DealList {...baseProps(onBulkArchive)} />);

    selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive deals" }));

    await vi.waitFor(() => expect(onBulkArchive).toHaveBeenCalledWith(["d1", "d2", "d3"]));
    await vi.waitFor(() =>
      expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument(),
    );
  });

  it("drops rows that left the view from the selection before archiving", async () => {
    const onBulkArchive = vi.fn(() => Promise.resolve(true));
    const props = baseProps(onBulkArchive);
    const { rerender } = render(<DealList {...props} />);

    selectAll();
    rerender(<DealList {...props} rows={rows.slice(0, 2)} total={2} />);

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive deals" }));

    await vi.waitFor(() => expect(onBulkArchive).toHaveBeenCalledWith(["d1", "d2"]));
  });

  it("does not archive twice when the Archive control is clicked again while pending", async () => {
    let settle = (): void => {};
    const onBulkArchive = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = () => resolve(true);
        }),
    );
    render(<DealList {...baseProps(onBulkArchive)} />);

    selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive deals" }));

    await vi.waitFor(() => expect(onBulkArchive).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onBulkArchive).toHaveBeenCalledTimes(1);

    settle();
  });

  it("keeps the selection when the archive fails", async () => {
    const onBulkArchive = vi.fn(() => Promise.resolve(false));
    render(<DealList {...baseProps(onBulkArchive)} />);

    selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive deals" }));

    await vi.waitFor(() => expect(onBulkArchive).toHaveBeenCalledWith(["d1", "d2", "d3"]));
    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });
});
