// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposedField } from "../types";
import { ProspectReviewStep } from "./ProspectReviewStep";
import type { RevealedProspect } from "./revealContract";

afterEach(cleanup);

function field(key = "person.email", value = "ada@example.com"): ProposedField {
  return {
    canonicalKey: key,
    label: key,
    values: [{ value, providers: ["apollo"] }],
    selectedValue: value,
    currentValue: null,
    isOverwrite: false,
    currentInvalid: false,
    supportsPrimary: true,
    defaultMakePrimary: true,
    defaultSelected: true,
  };
}

function revealed(overrides: Partial<RevealedProspect> = {}): RevealedProspect {
  return {
    providerRef: "p1",
    profile: {
      providerRef: "p1",
      fullName: "Ada Lovelace",
      title: "CTO",
      hasEmail: true,
      hasPhone: false,
    },
    outcomes: [],
    fields: [field()],
    match: { kind: "new" },
    ...overrides,
  };
}

describe("ProspectReviewStep", () => {
  it("counts only the people who will actually be added", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed(), revealed({ providerRef: "p2", fields: [] })]}
        failures={[]}
        outcomes={{}}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add 1 person" })).toBeEnabled();
  });

  it("refuses to apply when every reveal came back empty", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed({ fields: [] })]}
        failures={[]}
        outcomes={{}}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add 0 people" })).toBeDisabled();
  });

  it("hands back the selections the user left checked", () => {
    const onApply = vi.fn();
    render(
      <ProspectReviewStep
        revealed={[revealed()]}
        failures={[]}
        outcomes={{}}
        applying={false}
        error={null}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 1 person" }));
    expect(onApply).toHaveBeenCalledWith([
      {
        providerRef: "p1",
        selections: [{ canonicalKey: "person.email", value: "ada@example.com", makePrimary: true }],
      },
    ]);
  });

  it("drops a person the user unchecked", () => {
    const onApply = vi.fn();
    render(
      <ProspectReviewStep
        revealed={[revealed()]}
        failures={[]}
        outcomes={{}}
        applying={false}
        error={null}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Ada Lovelace" }));
    expect(screen.getByRole("button", { name: "Add 0 people" })).toBeDisabled();
  });

  it("shows one row's failure without hiding the rest", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed(), revealed({ providerRef: "p2" })]}
        failures={[]}
        outcomes={{ p1: { errorId: "E_ENRICH_006" }, p2: "created" }}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText(/changed while you were reviewing/)).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
  });

  it("says a profile failed to reveal instead of dropping it silently", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed()]}
        failures={[{ providerRef: "p9", errorId: "E_ENRICH_001" }]}
        outcomes={{}}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText("1 person could not be revealed.")).toBeInTheDocument();
  });

  it("reads the create-or-update badge off the reveal, not off a search result", () => {
    render(
      <ProspectReviewStep
        revealed={[
          revealed({
            match: { kind: "existing", personId: "person-1", personUpdatedAtIso: "2026-08-31" },
          }),
        ]}
        failures={[]}
        outcomes={{}}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText("Will be updated")).toBeInTheDocument();
  });

  it("surfaces a whole-call failure rather than closing silently", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed()]}
        failures={[]}
        outcomes={{}}
        applying={false}
        error="An admin changed which fields enrichment writes to."
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText(/An admin changed which fields/)).toBeInTheDocument();
  });

  it("drops a person already added from the next submission, so a second click cannot resend them", () => {
    const onApply = vi.fn();
    render(
      <ProspectReviewStep
        revealed={[revealed(), revealed({ providerRef: "p2" })]}
        failures={[]}
        outcomes={{ p1: "created" }}
        applying={false}
        error={null}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 1 person" }));
    expect(onApply).toHaveBeenCalledWith([expect.objectContaining({ providerRef: "p2" })]);
  });

  it("has nothing left to add once every person landed", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed(), revealed({ providerRef: "p2" })]}
        failures={[]}
        outcomes={{ p1: "created", p2: "updated" }}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add 0 people" })).toBeDisabled();
  });

  it("keeps a person whose apply failed available to retry", () => {
    render(
      <ProspectReviewStep
        revealed={[revealed(), revealed({ providerRef: "p2" })]}
        failures={[]}
        outcomes={{ p1: "created", p2: { errorId: "E_ENRICH_006" } }}
        applying={false}
        error={null}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add 1 person" })).toBeEnabled();
  });
});
