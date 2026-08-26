// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// "hot" is the catalog's "Hot" under case-insensitive matching, so it must not become a second
// option; "high priority" is applied-only and still has to be selectable.
const CATALOG = [{ id: "l1", name: "Hot" }];
const APPLIED = ["high priority", "hot"];

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: {
      listByTarget: {
        useQuery: (input: { target: string }) => ({
          data: input.target === "lead" ? CATALOG : [],
        }),
      },
      appliedNames: {
        useQuery: (input: { target: string }) => ({
          data: input.target === "lead" ? APPLIED : [],
        }),
      },
    },
  },
}));

import { LeadFilterBuilder } from "./LeadFilterBuilder";

afterEach(cleanup);

function openLabelRow() {
  const onApply = vi.fn();
  render(
    <LeadFilterBuilder users={[{ id: "u1", name: "Ann" }]} activeCount={0} onApply={onApply} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
  fireEvent.click(screen.getByLabelText("Condition 1 field"));
  fireEvent.click(screen.getByRole("option", { name: "Label" }));
  return onApply;
}

describe("LeadFilterBuilder label condition", () => {
  it("gives the Label field a Select value control, not a text box", () => {
    openLabelRow();
    const value = screen.getByLabelText("Condition 1 value");
    expect(value.tagName).toBe("BUTTON");
    expect(value).toHaveAttribute("aria-expanded");
  });

  it("offers the lead catalog plus applied-only names, deduped", () => {
    openLabelRow();
    fireEvent.click(screen.getByLabelText("Condition 1 value"));
    expect(screen.getByRole("option", { name: "high priority" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /^hot$/i })).toHaveLength(1);
  });

  it("offers the array operators for a label condition", () => {
    openLabelRow();
    fireEvent.click(screen.getByLabelText("Condition 1 operator"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "is",
      "is not",
      "is empty",
      "is not empty",
    ]);
  });

  it("applies every selected label as one is-any-of condition", () => {
    const onApply = openLabelRow();
    fireEvent.click(screen.getByLabelText("Condition 1 value"));
    fireEvent.click(screen.getByRole("option", { name: "Hot" }));
    fireEvent.click(screen.getByRole("option", { name: "high priority" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      combinator: "and",
      conditions: [{ field: "labels", op: "eq", value: ["Hot", "high priority"] }],
    });
  });

  it("seeds the reopened popover from the applied condition", () => {
    render(
      <LeadFilterBuilder
        users={[{ id: "u1", name: "Ann" }]}
        activeCount={2}
        appliedCondition={{
          combinator: "or",
          conditions: [
            { field: "title", op: "contains", value: "acme" },
            { field: "sourceOrigin", op: "eq", value: "web" },
          ],
        }}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByLabelText("Condition 1 value")).toHaveValue("acme");
    expect(screen.getByLabelText("Condition 2 value")).toHaveValue("web");
    expect(screen.getByLabelText("Match combinator")).toHaveTextContent("any condition");
  });

  it("does not compile a label condition with nothing picked", () => {
    const onApply = openLabelRow();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
});
