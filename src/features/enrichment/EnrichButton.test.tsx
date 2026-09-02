// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { ERROR_IDS } from "@/constants/errorIds";
import type { EnrichmentStatus } from "./router";
import type { RunView } from "./service";

const RESUME_ISO = "2026-08-24T14:20:00.000Z";
const FUTURE_ISO = "2099-01-02T14:20:00.000Z";
const asClock = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const resumeClock = asClock(RESUME_ISO);

const status = vi.hoisted<{ value: EnrichmentStatus | undefined }>(() => ({ value: undefined }));
const invalidateTimeline = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    enrichment: { status: { useQuery: () => ({ data: status.value }) } },
    useUtils: () => ({ contacts: { contactTimeline: { invalidate: invalidateTimeline } } }),
  },
}));

type Fail = { ok: false; error: { id: string; context?: Record<string, unknown> } };
const enrichRecordAction = vi.hoisted(() => vi.fn());
const applyEnrichmentAction = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ enrichRecordAction, applyEnrichmentAction }));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { SectionHeaderMenu } from "@/features/deal-workspace/sidebar/SectionHeaderMenu";
import { EnrichButton } from "./EnrichButton";

const S = ENRICHMENT_STRINGS.dialog;
const BUTTON = ENRICHMENT_STRINGS.button.label;

const run: RunView = {
  runId: "11111111-1111-4111-8111-111111111111",
  entityType: "person",
  entityId: "22222222-2222-4222-8222-222222222222",
  entityUpdatedAtIso: "2026-08-24T09:00:00.000Z",
  cached: false,
  mappingsFingerprint: "fp-1",
  createdAtIso: "2026-08-24T09:00:00.000Z",
  outcomes: [{ provider: "apollo", kind: "ok" }],
  fields: [
    {
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
    },
  ],
};

const ready: EnrichmentStatus = {
  ready: true,
  providers: [{ provider: "apollo", enabled: true, throttledUntilIso: null }],
};

const onApplied = vi.fn();

function renderButton(): void {
  render(
    <EnrichButton
      entityType="person"
      entityId={run.entityId}
      entityName="Jane Doe"
      onApplied={onApplied}
    >
      {(fill) => <SectionHeaderMenu sectionLabel="Person" menuItems={[]} {...fill} />}
    </EnrichButton>,
  );
}

beforeEach(() => {
  status.value = ready;
  enrichRecordAction.mockResolvedValue({ ok: true, value: run });
  applyEnrichmentAction.mockResolvedValue({
    ok: true,
    value: {
      appliedFields: ["person.title"],
      unresolved: [],
      entityUpdatedAtIso: "2026-08-24T09:30:00.000Z",
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders no button until a provider is connected", () => {
  status.value = { ready: false, providers: [] } satisfies EnrichmentStatus;
  renderButton();
  expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
});

it("renders no button while the status query is still in flight", () => {
  status.value = undefined;
  renderButton();
  expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
});

// The record may already have a cached run, which the server returns before it looks at provider
// availability. Disabling the button on a cooldown would hide the only way to open it.
it("keeps the button live while every connected provider is throttled", async () => {
  const user = userEvent.setup();
  status.value = {
    ready: true,
    providers: [
      { provider: "apollo", enabled: true, throttledUntilIso: FUTURE_ISO },
      { provider: "getprospect", enabled: false, throttledUntilIso: null },
    ],
  } satisfies EnrichmentStatus;
  renderButton();
  const button = screen.getByRole("button", { name: BUTTON });
  expect(button).not.toBeDisabled();

  await user.click(button);
  expect(enrichRecordAction).toHaveBeenCalled();
});

it("leaves the button enabled while one connected provider is still free", () => {
  status.value = {
    ready: true,
    providers: [
      { provider: "apollo", enabled: true, throttledUntilIso: FUTURE_ISO },
      { provider: "getprospect", enabled: true, throttledUntilIso: null },
    ],
  } satisfies EnrichmentStatus;
  renderButton();
  expect(screen.getByRole("button", { name: BUTTON })).toBeEnabled();
});

it("runs the fan-out on click and reviews the result", async () => {
  const user = userEvent.setup();
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));

  expect(enrichRecordAction).toHaveBeenCalledWith(
    { entityType: "person", entityId: run.entityId },
    "csrf-token",
  );
  expect(await screen.findByRole("checkbox", { name: "Job title" })).toBeChecked();
});

it("applies the selection, closes, and refreshes the surface", async () => {
  const user = userEvent.setup();
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: S.apply(1) }));

  expect(applyEnrichmentAction).toHaveBeenCalledWith(
    {
      runId: run.runId,
      expectedUpdatedAtIso: run.entityUpdatedAtIso,
      mappingsFingerprint: run.mappingsFingerprint,
      selections: [{ canonicalKey: "person.title", value: "Head of Growth" }],
    },
    "csrf-token",
  );
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

// A repointed mapping means the preview described a different target, so it needs the same escape
// hatch as a stale record rather than the generic failure.
it("offers Refresh when the field mapping changed while the review was open", async () => {
  const user = userEvent.setup();
  applyEnrichmentAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_MAPPINGS_CHANGED },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: S.apply(1) }));

  expect(await screen.findByRole("alert")).toHaveTextContent(S.mappingsChangedError);
  expect(screen.getByRole("button", { name: S.refresh })).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it("keeps the dialog open and offers Refresh when the record went stale", async () => {
  const user = userEvent.setup();
  applyEnrichmentAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_STALE },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: S.apply(1) }));

  expect(await screen.findByRole("alert")).toHaveTextContent(S.staleError);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: S.refresh }));
  expect(enrichRecordAction).toHaveBeenLastCalledWith(
    { entityType: "person", entityId: run.entityId, refresh: true },
    "csrf-token",
  );
});

// "Apply 1 field" counted the organization row, so closing as if it succeeded would report a
// change the user can see did not happen.
it("keeps the dialog open when an organization could not be linked", async () => {
  const user = userEvent.setup();
  applyEnrichmentAction.mockResolvedValue({
    ok: true,
    value: {
      appliedFields: ["person.title"],
      unresolved: ["person.companyName"],
      entityUpdatedAtIso: "2026-08-24T10:00:00.000Z",
    },
  });
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: S.apply(1) }));

  expect(await screen.findByRole("alert")).toHaveTextContent(S.unresolvedOrgError);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  // Never a second fan-out: with the cache off or the run aged out, re-running would call every
  // paid provider again purely because a company name could not be linked.
  expect(enrichRecordAction).toHaveBeenCalledTimes(1);

  // The committed row leaves the dialog. Keeping it would let a retry rewrite a field that
  // already landed and add a second change-log row for it.
  await waitFor(() =>
    expect(screen.queryByRole("checkbox", { name: "Job title" })).not.toBeInTheDocument(),
  );
});

it("surfaces a plain apply failure without closing", async () => {
  const user = userEvent.setup();
  applyEnrichmentAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.PERM_DENIED },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: S.apply(1) }));

  expect(await screen.findByRole("alert")).toHaveTextContent(S.applyError);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("says when a throttled run resumes", async () => {
  const user = userEvent.setup();
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_THROTTLED, context: { earliestRetryIso: RESUME_ISO } },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  expect(await screen.findByRole("alert")).toHaveTextContent(S.throttledError(resumeClock));
});

it("says what is missing when no provider can use this record", async () => {
  const user = userEvent.setup();
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_UNSUPPORTED },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  expect(await screen.findByRole("alert")).toHaveTextContent(S.unsupportedError);
});

it("says when nothing is connected", async () => {
  const user = userEvent.setup();
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_NO_PROVIDER },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    ENRICHMENT_STRINGS.button.notConfigured,
  );
});

it("says when the record carries nothing to look up by", async () => {
  const user = userEvent.setup();
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_NO_IDENTIFIER },
  } satisfies Fail);
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  expect(await screen.findByRole("alert")).toHaveTextContent(S.noIdentifierError);
});

// The History panel reads the change log through its own query, not the RSC tree, so a refresh
// alone leaves it telling the old story after an apply wrote to it.
it("invalidates the contact timeline after an apply", async () => {
  const user = userEvent.setup();
  renderButton();
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: S.apply(1) }));

  await waitFor(() =>
    expect(invalidateTimeline).toHaveBeenCalledWith({
      entityType: "person",
      entityId: run.entityId,
    }),
  );
});
