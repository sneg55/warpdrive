// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichDialog, type EnrichRunState } from "./EnrichDialog";
import type { ProviderOutcome } from "./providers/types";
import type { RunView } from "./service";

afterEach(cleanup);

const S = ENRICHMENT_STRINGS.dialog;
const RESUME_ISO = "2026-08-24T14:20:00.000Z";
const resumeClock = (() => {
  const d = new Date(RESUME_ISO);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
})();

const outcomes: ProviderOutcome[] = [
  { provider: "apollo", kind: "ok" },
  { provider: "getprospect", kind: "ok" },
  { provider: "rocketreach", kind: "quota", retryAfterIso: RESUME_ISO },
];

const run: RunView = {
  runId: "11111111-1111-4111-8111-111111111111",
  entityType: "person",
  entityId: "22222222-2222-4222-8222-222222222222",
  entityUpdatedAtIso: "2026-08-24T09:00:00.000Z",
  cached: false,
  mappingsFingerprint: "fp-1",
  createdAtIso: "2026-08-24T09:00:00.000Z",
  outcomes,
  fields: [
    {
      canonicalKey: "person.title",
      label: "Job title",
      values: [{ value: "Head of Growth", providers: ["apollo", "rocketreach"] }],
      selectedValue: "Head of Growth",
      currentValue: null,
      isOverwrite: false,
      currentInvalid: false,
      supportsPrimary: false,
      defaultMakePrimary: false,
      defaultSelected: true,
    },
    {
      canonicalKey: "person.linkedinUrl",
      label: "LinkedIn",
      values: [
        { value: "/in/janedoe", providers: ["apollo"] },
        { value: "/in/jane-doe-9", providers: ["rocketreach"] },
      ],
      selectedValue: "/in/janedoe",
      currentValue: null,
      isOverwrite: false,
      currentInvalid: false,
      supportsPrimary: false,
      defaultMakePrimary: false,
      defaultSelected: true,
    },
    {
      canonicalKey: "person.location",
      label: "Location",
      values: [{ value: "San Francisco, CA", providers: ["apollo"] }],
      selectedValue: "San Francisco, CA",
      currentValue: "SF",
      isOverwrite: true,
      currentInvalid: false,
      supportsPrimary: false,
      defaultMakePrimary: false,
      defaultSelected: false,
    },
  ],
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof EnrichDialog>> = {}): {
  onApply: ReturnType<typeof vi.fn>;
  onOpenChange: ReturnType<typeof vi.fn>;
} {
  const onApply = vi.fn();
  const onOpenChange = vi.fn();
  const state: EnrichRunState = { kind: "loaded", run };
  render(
    <EnrichDialog
      open
      onOpenChange={onOpenChange}
      entityName="Jane Doe"
      state={state}
      applyBusy={false}
      applyError={null}
      onRefresh={() => {}}
      onApply={onApply}
      now={new Date("2026-08-24T09:00:00.000Z")}
      {...overrides}
    />,
  );
  return { onApply, onOpenChange };
}

it("checks the empty fields, leaves an overwrite unchecked, and counts the apply", () => {
  renderDialog();
  expect(screen.getByRole("dialog")).toHaveTextContent(S.title("Jane Doe"));
  expect(screen.getByRole("checkbox", { name: "Job title" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Location" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: S.apply(2) })).toBeEnabled();
  expect(screen.getByText(S.sourceCount(3))).toBeInTheDocument();
});

it("applies the picked variant of a contested field", async () => {
  const user = userEvent.setup();
  const { onApply } = renderDialog();

  await user.click(screen.getByRole("radio", { name: "/in/jane-doe-9" }));
  await user.click(screen.getByRole("checkbox", { name: "Location" }));
  expect(screen.getByRole("button", { name: S.apply(3) })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: S.apply(3) }));
  expect(onApply).toHaveBeenCalledWith([
    { canonicalKey: "person.title", value: "Head of Growth" },
    { canonicalKey: "person.linkedinUrl", value: "/in/jane-doe-9" },
    { canonicalKey: "person.location", value: "San Francisco, CA" },
  ]);
});

it("disables Apply once nothing is selected", async () => {
  const user = userEvent.setup();
  renderDialog();
  await user.click(screen.getByRole("checkbox", { name: "Job title" }));
  await user.click(screen.getByRole("checkbox", { name: "LinkedIn" }));
  expect(screen.getByRole("button", { name: S.apply(0) })).toBeDisabled();
});

it("names every provider in the footer and says when a throttled one resumes", () => {
  renderDialog();
  const footer = screen.getByTestId("enrich-outcomes");
  expect(footer).toHaveTextContent(S.outcomeLine("apollo", ENRICHMENT_STRINGS.outcome.ok));
  expect(footer).toHaveTextContent(
    S.outcomeLineUntil("rocketreach", ENRICHMENT_STRINGS.outcome.quota, resumeClock),
  );
});

it("keeps the provider footer when nothing was found", () => {
  renderDialog({ state: { kind: "loaded", run: { ...run, fields: [] } } });
  expect(screen.getByText(S.nothingFound)).toBeInTheDocument();
  expect(screen.getByTestId("enrich-outcomes")).toHaveTextContent("rocketreach");
  expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
});

it("shows a run failure instead of the rows", () => {
  renderDialog({
    state: { kind: "error", canRefresh: false, message: S.throttledError(resumeClock) },
  });
  expect(screen.getByRole("alert")).toHaveTextContent(S.throttledError(resumeClock));
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("surfaces an apply failure without closing the dialog", async () => {
  const user = userEvent.setup();
  const { onOpenChange } = renderDialog({
    applyError: { message: S.applyError, canRefresh: false },
  });
  expect(screen.getByRole("alert")).toHaveTextContent(S.applyError);
  await user.click(screen.getByRole("checkbox", { name: "Location" }));
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("offers Refresh when the record went stale under review", async () => {
  const user = userEvent.setup();
  const onRefresh = vi.fn();
  renderDialog({ applyError: { message: S.staleError, canRefresh: true }, onRefresh });
  expect(screen.getByRole("alert")).toHaveTextContent(S.staleError);
  await user.click(screen.getByRole("button", { name: S.refresh }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

it("says a cached run is cached and offers a refresh", async () => {
  const user = userEvent.setup();
  const onRefresh = vi.fn();
  renderDialog({
    state: { kind: "loaded", run: { ...run, cached: true } },
    now: new Date("2026-08-27T09:00:00.000Z"),
    onRefresh,
  });
  expect(screen.getByText(S.cached(S.ageDays(3)))).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: S.refresh }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

it("shows a loading state while the fan-out runs", () => {
  renderDialog({ state: { kind: "loading" } });
  expect(screen.getByText(S.loading)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
