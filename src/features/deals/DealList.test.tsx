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
  DEALS_QUERY_KEY: (p: string) => ["deals", p],
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
};

// Drive the bulk-stage flow: tick a row's checkbox, then pick a stage from the Move-to-stage select.
function selectRowAndMove(stageName: string): void {
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme renewal" }));
  fireEvent.click(screen.getByLabelText("Move to stage"));
  fireEvent.click(screen.getByRole("option", { name: stageName }));
}

describe("DealList", () => {
  it("opens the deal when the title is clicked (title is a link)", () => {
    render(<DealList {...props} />);
    // Pipedrive opens the deal on title click; the title must be a real link.
    const link = screen.getByRole("link", { name: "Acme renewal" });
    expect(link).toHaveAttribute("href", "/deals/d1");
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
