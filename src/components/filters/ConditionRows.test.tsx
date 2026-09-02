// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FILTER_OP_LABELS } from "@/constants/filterOps";
import { type ConditionFieldOption, type ConditionRow, ConditionRows } from "./ConditionRows";

afterEach(cleanup);

const FIELDS: readonly ConditionFieldOption[] = [
  { field: "value", label: "Value", ops: ["gt", "lt", "isEmpty"], input: { kind: "number" } },
  { field: "title", label: "Title", ops: ["contains", "isEmpty"], input: { kind: "text" } },
  { field: "closes", label: "Expected close", ops: ["gt"], input: { kind: "date" } },
  {
    field: "labels",
    label: "Label",
    ops: ["eq"],
    input: {
      kind: "multiselect",
      options: [
        { value: "Hot", label: "Hot" },
        { value: "Cold", label: "Cold" },
      ],
    },
  },
];
const OP_LABELS = {
  gt: "greater than",
  lt: "less than",
  contains: "contains",
  isEmpty: FILTER_OP_LABELS.isEmpty,
};

function row(over: Partial<ConditionRow> = {}): ConditionRow {
  return { id: "r1", field: "value", op: "gt", value: "", ...over };
}

function renderRows(rows: ConditionRow[], over: Partial<Parameters<typeof ConditionRows>[0]> = {}) {
  const onRowsChange = vi.fn();
  const onCombinatorChange = vi.fn();
  const utils = render(
    <ConditionRows
      fields={FIELDS}
      opLabels={OP_LABELS}
      rows={rows}
      onRowsChange={onRowsChange}
      combinator="and"
      onCombinatorChange={onCombinatorChange}
      {...over}
    />,
  );
  return { ...utils, onRowsChange, onCombinatorChange };
}

describe("ConditionRows", () => {
  it("renders a DatePicker trigger, not a native date input, for a date field", () => {
    const { container } = renderRows([row({ field: "closes", op: "gt" })]);
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByLabelText("Condition 1 value").tagName).toBe("BUTTON");
  });

  it("clearing the date maps back to the empty string", () => {
    const { onRowsChange } = renderRows([row({ field: "closes", op: "gt", value: "2026-08-25" })]);
    fireEvent.click(screen.getByLabelText("Condition 1 value"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onRowsChange).toHaveBeenCalledWith([expect.objectContaining({ value: "" })]);
  });

  it("renders the design-system Input for a number field", () => {
    renderRows([row()]);
    const input = screen.getByLabelText("Condition 1 value");
    expect(input.tagName).toBe("INPUT");
    // The wrapper's focus ring is what a bare <input> did not have.
    expect(input).toHaveClass("focus-visible:ring-ring/50");
  });

  it("hides the combinator selector until there is more than one row", () => {
    const { rerender } = renderRows([row()]);
    expect(screen.queryByLabelText("Match combinator")).toBeNull();
    rerender(
      <ConditionRows
        fields={FIELDS}
        opLabels={OP_LABELS}
        rows={[row(), row({ id: "r2", field: "title", op: "contains" })]}
        onRowsChange={vi.fn()}
        combinator="and"
        onCombinatorChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Match combinator")).toBeInTheDocument();
  });

  it("never shows the combinator selector when supportsCombinator is false", () => {
    renderRows([row(), row({ id: "r2" })], { supportsCombinator: false });
    expect(screen.queryByLabelText("Match combinator")).toBeNull();
  });

  it("adds a row seeded from the first field and its first operator", () => {
    const { onRowsChange } = renderRows([]);
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    expect(onRowsChange).toHaveBeenCalledWith([
      expect.objectContaining({ field: "value", op: "gt", value: "" }),
    ]);
  });

  it("hides the value control for an operator that takes no value", () => {
    renderRows([row({ op: "isEmpty" })]);
    expect(screen.queryByLabelText("Condition 1 value")).toBeNull();
  });

  it("keeps the value slot in place so the operator dropdown does not resize", () => {
    const { container, rerender } = renderRows([row({ op: "gt", value: "5" })]);
    const slot = () => container.querySelector('[data-slot="condition-value"]');
    expect(slot()?.className).toContain("flex-[4]");
    rerender(
      <ConditionRows
        fields={FIELDS}
        opLabels={OP_LABELS}
        rows={[row({ op: "isEmpty" })]}
        onRowsChange={vi.fn()}
        combinator="and"
        onCombinatorChange={vi.fn()}
      />,
    );
    expect(slot()?.className).toContain("flex-[4]");
    expect(slot()?.childElementCount).toBe(0);
  });

  it("gives the field column more room than the operator so long labels stay on one line", () => {
    renderRows([row({ field: "closes", op: "gt" })]);
    expect(screen.getByLabelText("Condition 1 field").className).toContain("flex-[3]");
    expect(screen.getByLabelText("Condition 1 operator").className).toContain("flex-[2]");
  });

  it("drops a typed value when the operator switches to one that takes none", () => {
    const { onRowsChange } = renderRows([row({ field: "title", op: "contains", value: "acme" })]);
    fireEvent.click(screen.getByLabelText("Condition 1 operator"));
    fireEvent.click(screen.getByRole("option", { name: FILTER_OP_LABELS.isEmpty }));
    expect(onRowsChange).toHaveBeenCalledWith([
      expect.objectContaining({ op: "isEmpty", value: "" }),
    ]);
  });

  // "is any of" is one condition holding several labels, so the row value has to be a list.
  it("renders a design-system multi-select for a multiselect field, not a native one", () => {
    const { container } = renderRows([row({ field: "labels", op: "eq", value: ["Hot"] })]);
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByLabelText("Condition 1 value").tagName).toBe("BUTTON");
    // The already-picked value shows as a chip.
    expect(screen.getByText("Hot")).toBeInTheDocument();
  });

  it("reports every picked value on a multiselect row", () => {
    const { onRowsChange } = renderRows([row({ field: "labels", op: "eq", value: ["Hot"] })]);
    fireEvent.click(screen.getByLabelText("Condition 1 value"));
    fireEvent.click(screen.getByRole("option", { name: /Cold/ }));
    expect(onRowsChange).toHaveBeenCalledWith([
      expect.objectContaining({ value: ["Hot", "Cold"] }),
    ]);
  });

  it("removes the clicked row", () => {
    const { onRowsChange } = renderRows([row(), row({ id: "r2", field: "title", op: "contains" })]);
    fireEvent.click(screen.getByRole("button", { name: "Remove condition 1" }));
    expect(onRowsChange).toHaveBeenCalledWith([expect.objectContaining({ id: "r2" })]);
  });

  // The Select trigger is w-full, so as a flex item it claims the whole row and min-width:auto
  // stops it shrinking. Two of them then push the value control past the container edge. jsdom
  // does no layout, so the shrink classes are the only thing a test can hold here.
  it("lets the field and operator selects shrink instead of claiming the row", () => {
    renderRows([row()]);
    expect(screen.getByLabelText("Condition 1 field")).toHaveClass("min-w-0", "flex-[3]");
    expect(screen.getByLabelText("Condition 1 operator")).toHaveClass("min-w-0", "flex-[2]");
  });
});
