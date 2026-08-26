// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Catalogs keyed by target so a test can prove the builder queries "person" vs "organization":
// each target's catalog carries a name the other one does not.
const CATALOG: Record<string, Array<{ id: string; name: string }>> = {
  person: [{ id: "l1", name: "Hot" }],
  organization: [{ id: "l2", name: "Partner" }],
};
// "hot" is the catalog's "Hot" under case-insensitive matching, so it must not become a second
// option; "high priority" is applied-only and still has to be selectable.
const APPLIED: Record<string, string[]> = {
  person: ["high priority", "hot"],
  organization: [],
};

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    identity: { assignableUsers: { useQuery: () => ({ data: [{ id: "u1", name: "Ann" }] }) } },
    labels: {
      listByTarget: {
        useQuery: (input: { target: string }) => ({ data: CATALOG[input.target] ?? [] }),
      },
      appliedNames: {
        useQuery: (input: { target: string }) => ({ data: APPLIED[input.target] ?? [] }),
      },
    },
  },
}));

import { ContactFilterBuilder } from "./ContactFilterBuilder";
import {
  type ContactFilterConfig,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
} from "./contactFilterConfig";
import { ORG_FILTER_LABELS, PERSON_FILTER_LABELS } from "./contactFilterRows";

afterEach(cleanup);

function openLabelRow(config: ContactFilterConfig, fieldLabels: Record<string, string>) {
  const onApply = vi.fn();
  render(
    <ContactFilterBuilder
      config={config}
      fieldLabels={fieldLabels}
      activeCount={0}
      onApply={onApply}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
  fireEvent.click(screen.getByLabelText("Condition 1 field"));
  fireEvent.click(screen.getByRole("option", { name: "Label" }));
  return onApply;
}

describe("ContactFilterBuilder label condition", () => {
  it("gives the People Label field a Select value control, not a text box", () => {
    openLabelRow(PERSON_FILTER_CONFIG, PERSON_FILTER_LABELS);
    const value = screen.getByLabelText("Condition 1 value");
    expect(value.tagName).toBe("BUTTON");
    expect(value).toHaveAttribute("aria-expanded");
  });

  it("gives the Orgs Label field a Select fed by the organization catalog", () => {
    openLabelRow(ORG_FILTER_CONFIG, ORG_FILTER_LABELS);
    const value = screen.getByLabelText("Condition 1 value");
    expect(value.tagName).toBe("BUTTON");
    fireEvent.click(value);
    expect(screen.getByRole("option", { name: "Partner" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Hot" })).not.toBeInTheDocument();
  });

  it("offers applied-only names once, deduped against the catalog", () => {
    openLabelRow(PERSON_FILTER_CONFIG, PERSON_FILTER_LABELS);
    fireEvent.click(screen.getByLabelText("Condition 1 value"));
    expect(screen.getByRole("option", { name: "high priority" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /^hot$/i })).toHaveLength(1);
  });

  it("applies every selected label as one is-any-of condition", () => {
    const onApply = openLabelRow(PERSON_FILTER_CONFIG, PERSON_FILTER_LABELS);
    fireEvent.click(screen.getByLabelText("Condition 1 value"));
    fireEvent.click(screen.getByRole("option", { name: "Hot" }));
    fireEvent.click(screen.getByRole("option", { name: "high priority" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      combinator: "and",
      conditions: [{ field: "labels", op: "eq", value: ["Hot", "high priority"] }],
    });
  });

  it("does not compile a label condition with nothing picked", () => {
    const onApply = openLabelRow(PERSON_FILTER_CONFIG, PERSON_FILTER_LABELS);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("seeds the reopened popover from the applied definition", () => {
    render(
      <ContactFilterBuilder
        config={PERSON_FILTER_CONFIG}
        fieldLabels={PERSON_FILTER_LABELS}
        activeCount={2}
        appliedDefinition={{
          combinator: "or",
          conditions: [
            { field: "name", op: "contains", value: "acme" },
            { field: "primaryEmail", op: "contains", value: "globex" },
          ],
        }}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByLabelText("Condition 1 value")).toHaveValue("acme");
    expect(screen.getByLabelText("Condition 2 value")).toHaveValue("globex");
    expect(screen.getByLabelText("Match combinator")).toHaveTextContent("any condition");
  });

  it("still renders a number box for a numeric field", () => {
    render(
      <ContactFilterBuilder
        config={ORG_FILTER_CONFIG}
        fieldLabels={ORG_FILTER_LABELS}
        activeCount={0}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.click(screen.getByLabelText("Condition 1 field"));
    fireEvent.click(screen.getByRole("option", { name: "Employees" }));
    expect(screen.getByLabelText("Condition 1 value")).toHaveAttribute("type", "number");
  });
});
