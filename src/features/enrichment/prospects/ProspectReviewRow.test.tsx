// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposedField } from "../types";
import { ProspectReviewRow, type ProspectReviewRowProps } from "./ProspectReviewRow";

afterEach(cleanup);

function field(overrides: Partial<ProposedField> = {}): ProposedField {
  return {
    canonicalKey: "person.email",
    label: "Email",
    values: [{ value: "ada@example.com", providers: ["apollo"] }],
    selectedValue: "ada@example.com",
    currentValue: null,
    isOverwrite: false,
    currentInvalid: false,
    supportsPrimary: true,
    defaultMakePrimary: true,
    defaultSelected: true,
    ...overrides,
  };
}

function props(overrides: Partial<ProspectReviewRowProps> = {}): ProspectReviewRowProps {
  return {
    providerRef: "p1",
    fullName: "Ada Lovelace",
    title: "CTO",
    match: { kind: "new" },
    fields: [field()],
    checked: true,
    picks: {},
    outcome: "pending",
    onCheckedChange: vi.fn(),
    onPickChange: vi.fn(),
    ...overrides,
  };
}

describe("ProspectReviewRow", () => {
  it("says a person will be created when we do not hold them", () => {
    render(<ProspectReviewRow {...props()} />);
    expect(screen.getByText("Will be created")).toBeInTheDocument();
  });

  it("says a person will be updated when we already hold them", () => {
    render(
      <ProspectReviewRow
        {...props({
          match: { kind: "existing", personId: "x", personUpdatedAtIso: "2026-08-31T00:00:00Z" },
        })}
      />,
    );
    expect(screen.getByText("Will be updated")).toBeInTheDocument();
  });

  it("reports a reveal that found nothing and refuses the checkbox", () => {
    render(<ProspectReviewRow {...props({ fields: [], checked: false })} />);
    expect(screen.getByText("No contact details found")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Ada Lovelace" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Show fields" })).not.toBeInTheDocument();
  });

  it("hides the field detail until it is asked for", () => {
    render(<ProspectReviewRow {...props()} />);
    expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show fields" }));
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("shows a stale item's own error rather than a generic one", () => {
    render(<ProspectReviewRow {...props({ outcome: { errorId: "E_ENRICH_006" } })} />);
    expect(
      screen.getByText("This person changed while you were reviewing. Reopen and try again."),
    ).toBeInTheDocument();
  });

  it("shows a permission failure as its own message", () => {
    render(<ProspectReviewRow {...props({ outcome: { errorId: "E_PERM_001" } })} />);
    expect(screen.getByText("You do not have permission to edit this person.")).toBeInTheDocument();
  });

  it("falls back to a generic failure for an unmapped error", () => {
    render(<ProspectReviewRow {...props({ outcome: { errorId: "E_DB_001" } })} />);
    expect(screen.getByText("Could not add this person.")).toBeInTheDocument();
  });

  it("reports a created person", () => {
    render(<ProspectReviewRow {...props({ outcome: "created" })} />);
    expect(screen.getByText("Added")).toBeInTheDocument();
  });
});
