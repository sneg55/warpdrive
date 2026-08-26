// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichDialog } from "./EnrichDialog";
import type { RunView } from "./service";
import type { ProposedField } from "./types";

afterEach(cleanup);

const S = ENRICHMENT_STRINGS.dialog;

function emailField(overrides: Partial<ProposedField> = {}): ProposedField {
  return {
    canonicalKey: "person.email",
    label: "Email",
    values: [{ value: "nick@company.com", providers: ["apollo"] }],
    selectedValue: "nick@company.com",
    currentValue: "broken@",
    isOverwrite: false,
    currentInvalid: true,
    supportsPrimary: true,
    defaultMakePrimary: true,
    defaultSelected: true,
    ...overrides,
  };
}

function runWith(field: ProposedField): RunView {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    entityType: "person",
    entityId: "22222222-2222-4222-8222-222222222222",
    entityUpdatedAtIso: "2026-08-24T09:00:00.000Z",
    cached: false,
    mappingsFingerprint: "fp-1",
    createdAtIso: "2026-08-24T09:00:00.000Z",
    outcomes: [{ provider: "apollo", kind: "ok" }],
    fields: [field],
  };
}

function renderDialog(field: ProposedField, onApply = vi.fn()) {
  render(
    <EnrichDialog
      open
      onOpenChange={vi.fn()}
      entityName="Nick"
      state={{ kind: "loaded", run: runWith(field) }}
      applyBusy={false}
      applyError={null}
      onRefresh={vi.fn()}
      onApply={onApply}
    />,
  );
  return onApply;
}

it("opens on the promotion when the stored primary cannot be right", async () => {
  const onApply = renderDialog(emailField());
  await userEvent.click(screen.getByRole("button", { name: S.apply(1) }));
  expect(onApply).toHaveBeenCalledWith([
    { canonicalKey: "person.email", value: "nick@company.com", makePrimary: true },
  ]);
});

it("opens on adding alongside when the stored primary is fine", async () => {
  const onApply = renderDialog(
    emailField({
      currentValue: "old@company.com",
      currentInvalid: false,
      defaultMakePrimary: false,
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: S.apply(1) }));
  expect(onApply).toHaveBeenCalledWith([
    { canonicalKey: "person.email", value: "nick@company.com", makePrimary: false },
  ]);
});

it("carries a promotion the user turns on", async () => {
  const onApply = renderDialog(
    emailField({
      currentValue: "old@company.com",
      currentInvalid: false,
      defaultMakePrimary: false,
    }),
  );
  await userEvent.click(screen.getByRole("radio", { name: S.addAsPrimary }));
  await userEvent.click(screen.getByRole("button", { name: S.apply(1) }));
  expect(onApply).toHaveBeenCalledWith([
    { canonicalKey: "person.email", value: "nick@company.com", makePrimary: true },
  ]);
});

// A target with nothing to promote must not carry the key at all: the plan reads it for every
// selection, and a stray false would read as a deliberate "leave the primary alone" on a field
// that has no primary.
it("omits the flag on a target that holds one value", async () => {
  const onApply = renderDialog(
    emailField({
      canonicalKey: "person.title",
      label: "Job title",
      values: [{ value: "Head of Growth", providers: ["apollo"] }],
      selectedValue: "Head of Growth",
      currentValue: null,
      currentInvalid: false,
      supportsPrimary: false,
      defaultMakePrimary: false,
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: S.apply(1) }));
  expect(onApply).toHaveBeenCalledWith([{ canonicalKey: "person.title", value: "Head of Growth" }]);
});
