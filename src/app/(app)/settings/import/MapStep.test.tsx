// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  buildColumnMapping,
  initialWizardState,
  wizardReducer,
} from "@/features/import/wizardState";
import type { CustomFieldDef } from "@/types/customFields";
import { MapStep } from "./MapStep";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

const DEFS: CustomFieldDef[] = [
  {
    id: "cf1",
    targetEntity: "person",
    type: "text",
    name: "LinkedIn",
    key: "linkedin",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
  },
];

function Harness({ onContinue }: { onContinue: () => void }): React.ReactNode {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () =>
    wizardReducer(initialWizardState(), {
      type: "loadFile",
      filename: "c.csv",
      headers: ["Full Name", "Profile"],
      rows: [{ "Full Name": "Jane", Profile: "in/jane" }],
    }),
  );
  return (
    <MapStep state={state} dispatch={dispatch} defs={DEFS} busy={false} onContinue={onContinue} />
  );
}

function chooseSelect(label: string, option: string): void {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

it("keeps Continue disabled until a column maps to Name", () => {
  render(<Harness onContinue={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  chooseSelect("Maps to: Full Name", "Name *");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});

it("offers custom fields from the defs and calls onContinue", () => {
  const onContinue = vi.fn();
  render(<Harness onContinue={onContinue} />);
  fireEvent.click(screen.getByLabelText("Maps to: Profile"));
  expect(screen.getByRole("option", { name: "LinkedIn" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "LinkedIn" }));
  chooseSelect("Maps to: Full Name", "Name *");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onContinue).toHaveBeenCalledOnce();
});

// Pipedrive shows two example values under each spreadsheet column so you can tell what a column
// holds before mapping it (docs/parity-captures/leads-import-pd/08-map-step.png). Our prepare job
// already stores those rows on the batch; the map step must surface them.
function PreparedHarness(): React.ReactNode {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () =>
    wizardReducer(initialWizardState(), {
      type: "prepared",
      headers: ["agency_name", "state"],
      totalRows: 115,
      previewRows: [
        { agency_name: "New Jersey Transit Corporation", state: "NJ" },
        { agency_name: "Chicago Transit Authority", state: "IL" },
        { agency_name: "Bay Area Rapid Transit", state: "CA" },
      ],
    }),
  );
  return (
    <MapStep state={state} dispatch={dispatch} defs={DEFS} busy={false} onContinue={vi.fn()} />
  );
}

it("shows the first two sample values under each CSV column", () => {
  render(<PreparedHarness />);
  expect(screen.getByText("New Jersey Transit Corporation")).toBeInTheDocument();
  expect(screen.getByText("Chicago Transit Authority")).toBeInTheDocument();
  expect(screen.getByText("NJ")).toBeInTheDocument();
  expect(screen.getByText("IL")).toBeInTheDocument();
  // The third row is stored but must not be rendered.
  expect(screen.queryByText("Bay Area Rapid Transit")).not.toBeInTheDocument();
  expect(screen.queryByText("CA")).not.toBeInTheDocument();
});

// Cross-entity mapping, end to end through the real Radix picker: choosing an Organization field
// on a LEAD import must record entity "organization", not the primary entity. This is the bug that
// would otherwise send `url` to a nonexistent lead.domain column.
function LeadHarness({ onMapping }: { onMapping: (m: unknown) => void }): React.ReactNode {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => {
    const s = wizardReducer(initialWizardState(), { type: "setTarget", target: "lead" });
    return wizardReducer(s, {
      type: "prepared",
      headers: ["reporter_type", "url"],
      totalRows: 2,
      previewRows: [{ reporter_type: "Full Reporter", url: "njtransit.com" }],
    });
  });
  return (
    <MapStep
      state={state}
      dispatch={dispatch}
      defs={[]}
      busy={false}
      onContinue={() => onMapping(buildColumnMapping(state))}
    />
  );
}

it("maps a column to an Organization field on a lead import", () => {
  const onMapping = vi.fn();
  render(<LeadHarness onMapping={onMapping} />);

  // The picker groups fields by entity; both groups are present on a lead import.
  fireEvent.click(screen.getByLabelText("Maps to: url"));
  expect(screen.getByRole("option", { name: "Website / domain" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "Website / domain" }));

  chooseSelect("Maps to: reporter_type", "Title *");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(onMapping).toHaveBeenCalledWith({
    dedupMode: "skip",
    options: { rowNoteFromUnmapped: false },
    columns: {
      reporter_type: { entity: "lead", field: "title", isCustom: false, key: "" },
      url: { entity: "organization", field: "domain", isCustom: false, key: "" },
    },
  });
});

it("hides the dedup radio on a lead import, where leads always create", () => {
  render(<LeadHarness onMapping={vi.fn()} />);
  expect(screen.queryByText("When a matching contact already exists")).not.toBeInTheDocument();
});

it("records the row-note checkbox in the mapping options", () => {
  const onMapping = vi.fn();
  render(<LeadHarness onMapping={onMapping} />);
  chooseSelect("Maps to: reporter_type", "Title *");
  fireEvent.click(screen.getByRole("checkbox", { name: "Add unmapped columns as a note" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onMapping.mock.calls[0]?.[0]).toMatchObject({
    options: { rowNoteFromUnmapped: true },
  });
});

// The Checkbox primitive renders only the box; without its own <label> a sighted user sees an
// unlabeled control floating above the hint text.
it("renders a visible label next to the row-note checkbox", () => {
  render(<LeadHarness onMapping={vi.fn()} />);
  const box = screen.getByRole("checkbox", { name: "Add unmapped columns as a note" });
  const visible = screen.getByText("Add unmapped columns as a note");
  expect(visible).toBeInTheDocument();
  expect(visible.tagName).toBe("LABEL");
  expect(visible).toHaveAttribute("for", box.id);
});
