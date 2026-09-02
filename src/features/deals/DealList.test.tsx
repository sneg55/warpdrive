// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Radix Select (the "Move to stage" control) uses pointer capture + scrollIntoView, which jsdom
  // does not implement. Stub them so the option list opens under fireEvent.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const editCell = vi.fn();
vi.mock("./useInlineEdit", () => ({
  useInlineEdit: () => ({ editCell }),
}));

import { DealList, type DealListRow } from "./DealList";
import { DEAL_LIST_COLUMNS } from "./dealListColumns";

afterEach(() => {
  cleanup();
  editCell.mockReset();
});

const row: DealListRow = {
  id: "d1",
  title: "Acme renewal",
  value: "25000.00",
  stageId: "s1",
  boardPosition: "1",
  ownerId: "u1",
  personId: null,
  orgId: null,
  ownerName: "User A",
  orgName: "Acme Inc",
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-24T00:00:00Z"),
  updatedAt: "2026-06-24T00:00:00Z",
  customFields: {},
};

const props = {
  pipelineId: "p1",
  rows: [row],
  total: 1,
  totalValue: "25000.00",
  stages: [
    { id: "s1", name: "Qualified" },
    { id: "s2", name: "Proposal" },
  ],
  onBulkStage: () => Promise.resolve(true),
  visibleColumns: DEAL_LIST_COLUMNS.filter((c) => c.defaultVisible === true),
  currency: "USD",
};

// Drive the bulk-stage flow end to end: tick a row's checkbox, pick a stage from the Move-to-stage
// select, then affirm the confirmation the move now goes through.
function selectRowAndMove(stageName: string): void {
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme renewal" }));
  fireEvent.click(screen.getByLabelText("Move to stage"));
  fireEvent.click(screen.getByRole("option", { name: stageName }));
  fireEvent.click(screen.getByRole("button", { name: "Move deals" }));
}

describe("DealList", () => {
  it("opens the deal when the title is clicked (title is a link)", () => {
    render(<DealList {...props} />);
    // Pipedrive opens the deal on title click; the title must be a real link.
    const link = screen.getByRole("link", { name: "Acme renewal" });
    expect(link).toHaveAttribute("href", "/deals/d1");
  });

  it("wraps the table in a horizontally scrollable container so extra columns don't clip", () => {
    render(<DealList {...props} />);
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });

  it("shows Organization and Owner columns (Pipedrive column-rich list)", () => {
    render(<DealList {...props} />);
    expect(screen.getByRole("columnheader", { name: "Organization" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeInTheDocument();
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    expect(within(titleRow).getByText("Acme Inc")).toBeInTheDocument();
    expect(within(titleRow).getByText("User A")).toBeInTheDocument();
  });

  it("defaults to Pipedrive's column set: Contact person, Next activity, Expected close date visible", () => {
    // CV-4 / spec B4: PD's deals list defaults surface these three; WD previously hid them.
    const defaults = DEAL_LIST_COLUMNS.filter((c) => c.defaultVisible === true).map((c) => c.key);
    expect(defaults).toEqual(
      expect.arrayContaining(["person", "nextActivity", "expectedCloseDate"]),
    );
  });

  it("renders the Expected close date column with a locale-formatted date", () => {
    const withDate: DealListRow = { ...row, expectedCloseDate: "2026-08-01" };
    render(
      <DealList
        {...props}
        rows={[withDate]}
        visibleColumns={DEAL_LIST_COLUMNS.filter((c) => c.defaultVisible === true)}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Expected close date" })).toBeInTheDocument();
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    // Date-only value must render in local time (no UTC off-by-one).
    expect(within(titleRow).getByText("Aug 1, 2026")).toBeInTheDocument();
  });

  it("still allows inline title edit via an explicit edit control", () => {
    render(<DealList {...props} />);
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    fireEvent.click(within(titleRow).getByRole("button", { name: /edit title/i }));
    const input = within(titleRow).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Acme renewal 2027" } });
    fireEvent.blur(input);
    expect(editCell).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: "d1", field: "title", value: "Acme renewal 2027" }),
    );
  });

  it("does not save an empty/whitespace title", () => {
    render(<DealList {...props} />);
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    fireEvent.click(within(titleRow).getByRole("button", { name: /edit title/i }));
    const input = within(titleRow).getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(editCell).not.toHaveBeenCalled();
  });

  it("does not save a title longer than 255 chars", () => {
    render(<DealList {...props} />);
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    fireEvent.click(within(titleRow).getByRole("button", { name: /edit title/i }));
    const input = within(titleRow).getByRole("textbox");
    fireEvent.change(input, { target: { value: "x".repeat(256) } });
    fireEvent.blur(input);
    expect(editCell).not.toHaveBeenCalled();
  });

  it("clears the selection after a bulk stage move that succeeds", async () => {
    const onBulkStage = vi.fn(() => Promise.resolve(true));
    render(<DealList {...props} onBulkStage={onBulkStage} />);
    selectRowAndMove("Proposal");

    await vi.waitFor(() => expect(onBulkStage).toHaveBeenCalledWith(["d1"], "s2"));
    // Success: the selection bar (only shown when rows are selected) disappears.
    await vi.waitFor(() =>
      expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument(),
    );
  });

  it("caps painted rows to the render window and reveals the rest on Show more", () => {
    const many: DealListRow[] = Array.from({ length: 60 }, (_, i) => ({
      ...row,
      id: `d${i}`,
      title: `Deal ${i}`,
    }));
    const titleLinks = (): HTMLElement[] =>
      screen.getAllByRole("link").filter((l) => /^Deal \d+$/.test(l.textContent ?? ""));
    render(<DealList {...props} rows={many} total={60} />);
    // Only the first window (50) of the 60 rows is mounted; the rest wait behind Show more.
    expect(titleLinks()).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    expect(titleLinks()).toHaveLength(60);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  // A nine-column header, a select-all checkbox, a gear and a "0 deals - total value $0" footer
  // over zero rows is machinery, not information.
  it("drops the whole table when nothing is there and nothing is filtered", () => {
    render(
      <DealList
        {...props}
        rows={[]}
        total={0}
        totalValue="0"
        columnsMenu={<button type="button">Columns</button>}
        empty={<p>Nothing archived</p>}
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Select all deals" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Columns" })).toBeNull();
    expect(screen.queryByText(/total value/i)).toBeNull();
    expect(screen.getByText("Nothing archived")).toBeInTheDocument();
  });

  // A filter narrowed the view to nothing: the columns are still the view the user built, so
  // they stay, and the message says a filter is what emptied it.
  it("keeps the table when a filter is what emptied it", () => {
    render(
      <DealList {...props} rows={[]} total={0} totalValue="0" filtered empty={<p>No matches</p>} />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("keeps the selection when a bulk stage move fails (does not falsely signal success)", async () => {
    const onBulkStage = vi.fn(() => Promise.resolve(false));
    render(<DealList {...props} onBulkStage={onBulkStage} />);
    selectRowAndMove("Proposal");

    await vi.waitFor(() => expect(onBulkStage).toHaveBeenCalledWith(["d1"], "s2"));
    // Failure: selection is retained so the user can see it didn't apply and retry.
    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});
