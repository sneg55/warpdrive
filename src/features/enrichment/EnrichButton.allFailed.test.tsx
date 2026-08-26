// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { ERROR_IDS } from "@/constants/errorIds";
import type { EnrichmentStatus } from "./router";

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

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { SectionHeaderMenu } from "@/features/deal-workspace/sidebar/SectionHeaderMenu";
import { EnrichButton } from "./EnrichButton";

const S = ENRICHMENT_STRINGS.dialog;
const O = ENRICHMENT_STRINGS.outcome;
const BUTTON = ENRICHMENT_STRINGS.button.label;

async function clickFillGaps(): Promise<void> {
  const user = userEvent.setup();
  render(
    <EnrichButton
      entityType="person"
      entityId="22222222-2222-4222-8222-222222222222"
      entityName="Jane Doe"
    >
      {(fill) => <SectionHeaderMenu sectionLabel="Person" menuItems={[]} {...fill} />}
    </EnrichButton>,
  );
  await user.click(screen.getByRole("button", { name: BUTTON }));
}

function failsWith(context: Record<string, unknown> | undefined): void {
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error:
      context === undefined
        ? { id: ERROR_IDS.ENRICH_ALL_FAILED }
        : { id: ERROR_IDS.ENRICH_ALL_FAILED, context },
  } satisfies Fail);
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

// A rejected key, a timeout, and an outage need three different reactions from the user, so
// collapsing them into one sentence throws away the only part that says what to do.
it("names each provider and why it failed when every provider failed", async () => {
  failsWith({ reasons: { apollo: "auth", rocketreach: "timeout", getprospect: "provider_error" } });
  await clickFillGaps();

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(S.allFailedError);
  expect(alert).toHaveTextContent(S.outcomeLine("apollo", O.auth));
  expect(alert).toHaveTextContent(S.outcomeLine("rocketreach", O.timeout));
  expect(alert).toHaveTextContent(S.outcomeLine("getprospect", O.provider_error));
});

it("shows the plain all-failed message when the server sent no reasons", async () => {
  failsWith(undefined);
  await clickFillGaps();

  expect(await screen.findByRole("alert")).toHaveTextContent(S.allFailedError);
});

it("renders no undefined verdict for an outcome kind it does not know", async () => {
  failsWith({ reasons: { apollo: "combusted", rocketreach: "timeout" } });
  await clickFillGaps();

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(S.outcomeLine("rocketreach", O.timeout));
  expect(alert.textContent).not.toContain("undefined");
});

// Waiting cannot fix a key the server cannot decrypt, so this must not read as a rate limit.
it("says a stored key needs re-entering when the server could not read one", async () => {
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_KEY_UNREADABLE, context: { providers: ["apollo"] } },
  } satisfies Fail);
  await clickFillGaps();

  expect(await screen.findByRole("alert")).toHaveTextContent(S.keyUnreadableError);
});

it("names the plan when no provider's plan covers the lookup", async () => {
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_NOT_ENTITLED, context: { providers: ["apollo"] } },
  } satisfies Fail);
  await clickFillGaps();

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(S.notEntitledError);
  expect(screen.getByRole("button", { name: S.refresh })).toBeInTheDocument();
});

// A run where every provider failed is persisted so a repeat click does not re-spend a credit, and
// the cache replays that failure for the whole TTL. Without Refresh on an error the record is stuck
// on it for thirty days, long after the providers came back.
it("offers Refresh on a failure a fresh run could resolve", async () => {
  const user = userEvent.setup();
  failsWith({ reasons: { apollo: "timeout" } });
  await clickFillGaps();

  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: S.refresh }));

  expect(enrichRecordAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ refresh: true }),
    "csrf-token",
  );
});

it("does not offer Refresh when the record itself has nothing to look up by", async () => {
  enrichRecordAction.mockResolvedValue({
    ok: false,
    error: { id: ERROR_IDS.ENRICH_NO_IDENTIFIER },
  } satisfies Fail);
  await clickFillGaps();

  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: S.refresh })).not.toBeInTheDocument();
});
