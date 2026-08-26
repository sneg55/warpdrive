// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichDialog, type EnrichRunState } from "./EnrichDialog";
import type { RunView } from "./service";
import type { ProposedField } from "./types";

afterEach(cleanup);

const title: ProposedField = {
  canonicalKey: "person.title",
  label: "Job title",
  values: [{ value: "Head of Growth", providers: ["apollo"] }],
  selectedValue: "Head of Growth",
  currentValue: null,
  isOverwrite: false,
  currentInvalid: false,
  supportsPrimary: false,
  defaultMakePrimary: false,
  defaultSelected: true,
};

const company: ProposedField = {
  canonicalKey: "person.companyName",
  label: "Company",
  values: [{ value: "Initech", providers: ["apollo"] }],
  selectedValue: "Initech",
  currentValue: null,
  isOverwrite: false,
  currentInvalid: false,
  supportsPrimary: false,
  defaultMakePrimary: false,
  defaultSelected: true,
};

function runWith(fields: ProposedField[], updatedAtIso: string): RunView {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    entityType: "person",
    entityId: "22222222-2222-4222-8222-222222222222",
    entityUpdatedAtIso: updatedAtIso,
    cached: false,
    mappingsFingerprint: "fp-1",
    createdAtIso: "2026-08-24T09:00:00.000Z",
    outcomes: [{ provider: "apollo", kind: "ok" }],
    fields,
  };
}

function dialog(run: RunView, onApply: () => void, applyBusy = false): React.ReactNode {
  const state: EnrichRunState = { kind: "loaded", run };
  return (
    <EnrichDialog
      open
      onOpenChange={() => undefined}
      entityName="Jane Doe"
      state={state}
      applyBusy={applyBusy}
      applyError={null}
      onRefresh={() => undefined}
      onApply={onApply}
    />
  );
}

// A partial apply drops the rows it committed and moves the record version. Remounting the panel on
// that version reset every remaining row to its default, so a gap the user had deliberately
// unchecked came back checked and a retry could write a value they declined.
it("keeps a row the user unchecked after a partial apply", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  const view = render(dialog(runWith([title, company], "2026-08-24T09:00:00.000Z"), onApply));

  await user.click(screen.getByRole("checkbox", { name: /Job title/ }));
  expect(screen.getByRole("checkbox", { name: /Job title/ })).not.toBeChecked();

  // The company could not be linked, so it stays; the title committed and leaves the dialog.
  view.rerender(dialog(runWith([title], "2026-08-24T09:05:00.000Z"), onApply));

  expect(screen.getByRole("checkbox", { name: /Job title/ })).not.toBeChecked();
});

// Refresh is a paid fan-out. Starting one while an apply is in flight lets the two answers land on
// the same dialog in either order.
it("locks Refresh while an apply is in flight", () => {
  const cached = { ...runWith([title], "2026-08-24T09:00:00.000Z"), cached: true };
  render(dialog(cached, () => undefined, true));

  expect(screen.getByRole("button", { name: ENRICHMENT_STRINGS.dialog.refresh })).toBeDisabled();
});
