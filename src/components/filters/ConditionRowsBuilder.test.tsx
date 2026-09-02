// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ConditionFieldOption, ConditionRowsBuilder } from "./ConditionRowsBuilder";

afterEach(cleanup);

const FIELDS: readonly ConditionFieldOption[] = [
  { field: "value", label: "Value", ops: ["gt", "lt"], input: { kind: "number" } },
  { field: "title", label: "Title", ops: ["contains"], input: { kind: "text" } },
];
const OP_LABELS = { gt: "greater than", lt: "less than", contains: "contains" };

describe("ConditionRowsBuilder", () => {
  it("opens, adds a condition row, and applies the typed value as a raw row", () => {
    const onApply = vi.fn();
    render(
      <ConditionRowsBuilder
        fields={FIELDS}
        opLabels={OP_LABELS}
        activeCount={0}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    // Emits the raw row (default field = first field, default op = its first op) plus combinator.
    expect(onApply).toHaveBeenCalledWith([{ field: "value", op: "gt", value: "1000" }], "and");
  });

  it("opens a popover wide enough for a date row with a period select and a picker", () => {
    render(
      <ConditionRowsBuilder
        fields={FIELDS}
        opLabels={OP_LABELS}
        activeCount={0}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const content = screen.getByRole("button", { name: "Apply" }).closest(".w-\\[36rem\\]");
    expect(content).not.toBeNull();
  });

  it("shows the active-condition count badge", () => {
    render(
      <ConditionRowsBuilder
        fields={FIELDS}
        opLabels={OP_LABELS}
        activeCount={3}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a date field through the design-system DatePicker, not a native date input", () => {
    const dateFields: readonly ConditionFieldOption[] = [
      { field: "closes", label: "Expected close", ops: ["gt"], input: { kind: "date" } },
    ];
    const { container } = render(
      <ConditionRowsBuilder
        fields={dateFields}
        opLabels={OP_LABELS}
        activeCount={0}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByLabelText("Condition 1 value").tagName).toBe("BUTTON");
  });

  it("Clear resets and calls onClear", () => {
    const onClear = vi.fn();
    render(
      <ConditionRowsBuilder
        fields={FIELDS}
        opLabels={OP_LABELS}
        activeCount={2}
        onApply={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
