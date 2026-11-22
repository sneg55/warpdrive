// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
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

function selectRowAndMove(stageName: string): void {
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme renewal" }));
  fireEvent.click(screen.getByLabelText("Move to stage"));
  fireEvent.click(screen.getByRole("option", { name: stageName }));
  fireEvent.click(screen.getByRole("button", { name: "Move deals" }));
}

describe("DealList currency", () => {
  it("renders row values and the total in the instance base currency", () => {
    render(<DealList {...props} visibleColumns={DEAL_LIST_COLUMNS} currency="EUR" />);
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    expect(within(titleRow).getByText("€25,000")).toBeInTheDocument();
    expect(screen.queryByText(/\$25,000/)).toBeNull();
    const footer = screen.getByRole("table").querySelector("tfoot");
    expect(footer?.textContent).toContain("total value €25,000");
  });
});

describe("DealList", () => {
  it("opens the deal when the title is clicked (title is a link)", () => {
    render(<DealList {...props} />);
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
    expect(within(titleRow).getByText("Aug 1, 2026")).toBeInTheDocument();
  });

  it("offers a hidden-by-default Status column that badges a closed deal", () => {
    const statusCol = DEAL_LIST_COLUMNS.find((c) => c.key === "status");
    expect(statusCol?.defaultVisible).not.toBe(true);
    const lost: DealListRow = { ...row, status: "lost" };
    render(<DealList {...props} rows={[lost]} visibleColumns={DEAL_LIST_COLUMNS} />);
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    const titleRow = screen.getByText("Acme renewal").closest("tr") as HTMLElement;
    expect(within(titleRow).getByText("Lost")).toBeInTheDocument();
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
    expect(titleLinks()).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    expect(titleLinks()).toHaveLength(60);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});
