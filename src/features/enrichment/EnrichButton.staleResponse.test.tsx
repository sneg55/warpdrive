// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { EnrichmentStatus } from "./router";
import type { RunView } from "./service";

const status = vi.hoisted<{ value: EnrichmentStatus | undefined }>(() => ({ value: undefined }));
const invalidateTimeline = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    enrichment: { status: { useQuery: () => ({ data: status.value }) } },
    useUtils: () => ({ contacts: { contactTimeline: { invalidate: invalidateTimeline } } }),
  },
}));

const enrichRecordAction = vi.hoisted(() => vi.fn());
const applyEnrichmentAction = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ enrichRecordAction, applyEnrichmentAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { SectionHeaderMenu } from "@/features/deal-workspace/sidebar/SectionHeaderMenu";
import { EnrichButton } from "./EnrichButton";

const BUTTON = ENRICHMENT_STRINGS.button.label;
const CLOSED = "11111111-1111-4111-8111-111111111111";
const SHOWING = "22222222-2222-4222-8222-222222222222";

function runFor(entityId: string, label: string): RunView {
  return {
    runId: `run-${entityId}`,
    entityType: "person",
    entityId,
    entityUpdatedAtIso: "2026-08-24T12:00:00.000Z",
    cached: false,
    createdAtIso: "2026-08-24T12:00:00.000Z",
    mappingsFingerprint: "fp-1",
    outcomes: [{ provider: "apollo", kind: "ok" }],
    fields: [
      {
        canonicalKey: "person.title",
        label,
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
}

function Harness({ entityId }: { entityId: string }): React.ReactNode {
  return (
    <EnrichButton entityType="person" entityId={entityId} entityName="Jane Doe">
      {(fill) => <SectionHeaderMenu sectionLabel="Person" menuItems={[]} {...fill} />}
    </EnrichButton>
  );
}

beforeEach(() => {
  status.value = {
    ready: true,
    providers: [{ provider: "apollo", enabled: true, throttledUntilIso: null }],
  } satisfies EnrichmentStatus;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The record sidebar is reused as the user moves between records, so a slow answer for the one just
// closed can land after a fast answer for the one now on screen. Taking it would show the wrong
// person's proposals and post the wrong runId on Apply.
it("ignores an answer for a record it is no longer showing", async () => {
  const user = userEvent.setup();
  let release: (() => void) | undefined;
  enrichRecordAction.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, value: runFor(CLOSED, "Stale title") });
      }),
  );

  const view = render(<Harness entityId={CLOSED} />);
  await user.click(screen.getByRole("button", { name: BUTTON }));
  // The user gives up waiting and moves on, which is how the sidebar reaches the next record.
  await user.keyboard("{Escape}");

  enrichRecordAction.mockResolvedValue({ ok: true, value: runFor(SHOWING, "Live title") });
  view.rerender(<Harness entityId={SHOWING} />);
  await user.click(await screen.findByRole("button", { name: BUTTON }));
  expect(await screen.findByText("Live title")).toBeInTheDocument();

  release?.();
  await waitFor(() => expect(enrichRecordAction).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Stale title")).not.toBeInTheDocument();
  expect(screen.getByText("Live title")).toBeInTheDocument();
});

// Closing the dialog does not cancel the fan-out. While it is still running the button has to stay
// busy, or a second click starts another paid fan-out before the first can fill the cache.
it("stays busy after the dialog is dismissed mid-request", async () => {
  const user = userEvent.setup();
  let release: (() => void) | undefined;
  enrichRecordAction.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, value: runFor(SHOWING, "Live title") });
      }),
  );

  render(<Harness entityId={SHOWING} />);
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.keyboard("{Escape}");

  expect(await screen.findByRole("button", { name: BUTTON })).toBeDisabled();

  release?.();
  await waitFor(() => expect(screen.getByRole("button", { name: BUTTON })).toBeEnabled());
  expect(enrichRecordAction).toHaveBeenCalledTimes(1);
});

// An apply is as slow as the fan-out. If it lands after the sidebar has moved on, closing the
// dialog or writing its error would hit whichever record is on screen now.
it("does not close another record's dialog when a slow apply lands", async () => {
  const user = userEvent.setup();
  enrichRecordAction.mockResolvedValue({ ok: true, value: runFor(CLOSED, "Stale title") });
  let release: (() => void) | undefined;
  applyEnrichmentAction.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            ok: true,
            value: { appliedFields: [], unresolved: [], entityUpdatedAtIso: "" },
          });
      }),
  );

  const view = render(<Harness entityId={CLOSED} />);
  await user.click(screen.getByRole("button", { name: BUTTON }));
  await user.click(await screen.findByRole("button", { name: /Apply/ }));

  enrichRecordAction.mockResolvedValue({ ok: true, value: runFor(SHOWING, "Live title") });
  view.rerender(<Harness entityId={SHOWING} />);
  await user.click(await screen.findByRole("button", { name: BUTTON }));
  expect(await screen.findByText("Live title")).toBeInTheDocument();

  release?.();
  await waitFor(() => expect(applyEnrichmentAction).toHaveBeenCalledTimes(1));
  expect(screen.getByText("Live title")).toBeInTheDocument();
});

// A rejected action, a dropped connection or an unexpected server throw, must not leave the record
// loading forever with its button disabled.
it("recovers when the enrichment action rejects", async () => {
  const user = userEvent.setup();
  enrichRecordAction.mockRejectedValueOnce(new Error("connection lost"));

  render(<Harness entityId={SHOWING} />);
  await user.click(screen.getByRole("button", { name: BUTTON }));

  // The failure is reported rather than the dialog sitting on a spinner, and the button is usable
  // again once the dialog is out of the way.
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: BUTTON })).toBeEnabled());
});
