// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichFieldRow } from "./EnrichFieldRow";
import type { ProposedField } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

afterEach(cleanup);

function field(overrides: Partial<ProposedField> = {}): ProposedField {
  return {
    canonicalKey: "person.email",
    label: "Email",
    values: [{ value: "nick@company.com", providers: ["apollo"] }],
    selectedValue: "nick@company.com",
    currentValue: "broken@",
    isOverwrite: false,
    currentInvalid: false,
    supportsPrimary: true,
    defaultMakePrimary: false,
    defaultSelected: true,
    ...overrides,
  };
}

function renderRow(f: ProposedField, makePrimary = false, onMakePrimaryChange = vi.fn()) {
  render(
    <EnrichFieldRow
      field={f}
      checked
      selectedValue={String(f.selectedValue)}
      makePrimary={makePrimary}
      onCheckedChange={vi.fn()}
      onValueChange={vi.fn()}
      onMakePrimaryChange={onMakePrimaryChange}
    />,
  );
  return onMakePrimaryChange;
}

it("offers the promotion choice on a target that holds a set", () => {
  renderRow(field());
  expect(screen.getByRole("radio", { name: S.addAlongside })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: S.addAsPrimary })).toBeInTheDocument();
});

it("offers no promotion choice on a target that holds one value", () => {
  renderRow(field({ supportsPrimary: false, isOverwrite: true }));
  expect(screen.queryByRole("radio", { name: S.addAsPrimary })).not.toBeInTheDocument();
});

it("reports the promotion when the user picks it", () => {
  const onMakePrimaryChange = renderRow(field());
  fireEvent.click(screen.getByRole("radio", { name: S.addAsPrimary }));
  expect(onMakePrimaryChange).toHaveBeenCalledWith(true);
});

// The dot is a few pixels wide and the words next to it are the obvious click target. On a row
// that opens on the promotion, text that does nothing means a user who clicks "add alongside" to
// opt out still submits a promotion.
it("takes the choice from a click on the option text", () => {
  const onMakePrimaryChange = renderRow(field({ defaultMakePrimary: true }), true);
  fireEvent.click(screen.getByText(S.addAlongside));
  expect(onMakePrimaryChange).toHaveBeenCalledWith(false);
});

// Same reasoning for the row's other radio group: two groups sitting inches apart must not differ
// on whether their words are clickable.
it("takes the contested-value pick from a click on the value text", () => {
  const onValueChange = vi.fn();
  render(
    <EnrichFieldRow
      field={field({
        supportsPrimary: false,
        values: [
          { value: "nick@company.com", providers: ["apollo"] },
          { value: "n.sawinyh@company.com", providers: ["rocketreach"] },
        ],
      })}
      checked
      selectedValue="nick@company.com"
      makePrimary={false}
      onCheckedChange={vi.fn()}
      onValueChange={onValueChange}
      onMakePrimaryChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("n.sawinyh@company.com"));
  expect(onValueChange).toHaveBeenCalledWith("n.sawinyh@company.com");
});

// The row has to say why the record's own address is not worth keeping in front, or promoting
// reads as enrichment overruling a value somebody typed on purpose.
it("says the stored value is broken when it cannot be right", () => {
  renderRow(field({ currentInvalid: true }));
  expect(screen.getByText(S.currentInvalid("broken@"))).toBeInTheDocument();
});

it("stays silent about the stored value when it is fine", () => {
  renderRow(field({ currentValue: "old@company.com" }));
  expect(screen.queryByText(S.currentInvalid("old@company.com"))).not.toBeInTheDocument();
});
