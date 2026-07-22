// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";

// The Details block composes several field controls that pull router/context; stub them so this
// test isolates the block's own empty-vs-populated branching.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("./InlineCustomField", () => ({ InlineCustomField: () => null }));
vi.mock("./FieldRow", () => ({
  FieldRow: ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <div data-testid="field-row">
      {label}
      {children}
    </div>
  ),
}));
vi.mock("@/features/custom-fields/render", () => ({
  isCustomFieldValueEmpty: () => false,
  CustomFieldFormControl: () => null,
}));
vi.mock("@/features/inline-edit/InlineEditFooter", () => ({
  InlineEditFooter: ({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) => (
    <div>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onSave}>
        Save
      </button>
    </div>
  ),
}));
vi.mock("@/features/deals/updateAction", () => ({
  updateDealAction: () => Promise.resolve({ ok: true as const, value: {} }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { DetailsBlock } from "./DetailsBlock";

afterEach(cleanup);

const EMPTY_HINT = "No custom fields yet. Add them with Customize fields.";

function def(): CustomFieldDef {
  return { id: "f1", type: "text", name: "Industry", key: "industry" } as CustomFieldDef;
}

const base = {
  dealId: "d1",
  expectedUpdatedAt: "2026-07-20T00:00:00Z",
  customFields: {},
  currency: "USD",
};

describe("DetailsBlock empty state", () => {
  it("shows a hint and NO Save/Cancel when bulk-editing a section with no custom fields", () => {
    render(<DetailsBlock {...base} customFieldDefs={[]} bulkEditing onExitBulk={() => {}} />);
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("shows a hint (not a blank box) in read mode when there are no custom fields", () => {
    render(<DetailsBlock {...base} customFieldDefs={[]} />);
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it("renders the field rows (no hint) when custom fields exist", () => {
    render(<DetailsBlock {...base} customFieldDefs={[def()]} />);
    expect(screen.queryByText(EMPTY_HINT)).toBeNull();
    expect(screen.getByText("Industry")).toBeInTheDocument();
  });
});
