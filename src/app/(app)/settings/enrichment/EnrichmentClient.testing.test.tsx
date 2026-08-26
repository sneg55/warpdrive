// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { TestProviderActionResult } from "@/features/enrichment/settingsActions";
import type { ProviderCardView } from "./ProviderCard";

const reportError = vi.fn();

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ enrichment: { status: { invalidate: () => Promise.resolve() } } }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
vi.mock("@/features/enrichment/settingsActions", () => ({
  setProviderKeyAction: vi.fn(() => Promise.resolve({ ok: true })),
  clearProviderKeyAction: vi.fn(() => Promise.resolve({ ok: true })),
  setProviderEnabledAction: vi.fn(() => Promise.resolve({ ok: true })),
  setMappingAction: vi.fn(() => Promise.resolve({ ok: true })),
  clearMappingAction: vi.fn(() => Promise.resolve({ ok: true })),
  setCacheTtlAction: vi.fn(() => Promise.resolve({ ok: true })),
  testProviderAction: vi.fn(() => Promise.resolve({ ok: true, kind: "ok" })),
}));

import { testProviderAction } from "@/features/enrichment/settingsActions";
import { EnrichmentClient } from "./EnrichmentClient";

const S = ENRICHMENT_STRINGS.settings;
type Release = (result: TestProviderActionResult) => void;

function connected(provider: string, name: string): ProviderCardView {
  return {
    provider,
    name,
    enabled: false,
    hasKey: true,
    apiKeyHint: "9f2a",
    throttledUntilIso: null,
    throttleReason: null,
    needsAttention: false,
  };
}

function renderPair() {
  render(
    <EnrichmentClient
      providers={[connected("apollo", "Apollo"), connected("rocketreach", "RocketReach")]}
      person={{ entity: "person", title: S.mappingPerson, rows: [], hasCustomFields: false }}
      organization={{
        entity: "organization",
        title: S.mappingOrganization,
        rows: [],
        hasCustomFields: false,
      }}
      cacheTtlDays={30}
    />,
  );
}

function nth(items: HTMLElement[], index: number): HTMLElement {
  const found = items[index];
  expect(found).toBeDefined();
  return found as HTMLElement;
}

function toggleFor(name: string): HTMLElement {
  return screen.getByRole("switch", { name: `${S.enabledLabel}: ${name}` });
}

// The probe button changes label mid-flight, so it is matched on either label and told apart from
// the other card's by DOM order.
function probeButton(index: number): HTMLElement {
  const buttons = screen.getAllByRole("button", {
    name: (accessibleName: string) => accessibleName === S.test || accessibleName === S.testing,
  });
  return nth(buttons, index);
}

function saveButton(index: number): HTMLElement {
  return nth(screen.getAllByRole("button", { name: S.save }), index);
}

function removeButton(index: number): HTMLElement {
  return nth(screen.getAllByRole("button", { name: S.remove }), index);
}

function deferProbes(): Map<string, Release> {
  const releases = new Map<string, Release>();
  vi.mocked(testProviderAction).mockImplementation(
    (raw) =>
      new Promise<TestProviderActionResult>((resolve) => {
        releases.set((raw as { provider: string }).provider, resolve);
      }),
  );
  return releases;
}

async function startProbe(releases: Map<string, Release>, index: number, provider: string) {
  fireEvent.click(probeButton(index));
  await waitFor(() => expect(releases.has(provider)).toBe(true));
}

function release(
  releases: Map<string, Release>,
  provider: string,
  result: TestProviderActionResult,
) {
  const resolve = releases.get(provider);
  expect(resolve).toBeDefined();
  resolve?.(result);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("EnrichmentClient overlapping connection tests", () => {
  it("keeps the second provider's Test locked when the first probe answers first", async () => {
    const releases = deferProbes();
    renderPair();
    await startProbe(releases, 0, "apollo");
    await startProbe(releases, 1, "rocketreach");

    release(releases, "apollo", { ok: true, kind: "ok" });

    await waitFor(() => expect(probeButton(0)).toBeEnabled());
    expect(probeButton(1)).toBeDisabled();
    expect(probeButton(1)).toHaveTextContent(S.testing);
  });

  it("locks the toggle, Save and Remove of the provider being tested", async () => {
    const releases = deferProbes();
    renderPair();
    await startProbe(releases, 0, "apollo");

    expect(probeButton(0)).toBeDisabled();
    expect(toggleFor("Apollo")).toBeDisabled();
    expect(saveButton(0)).toBeDisabled();
    expect(removeButton(0)).toBeDisabled();
  });

  it("leaves the other provider usable while one is being tested", async () => {
    const releases = deferProbes();
    renderPair();
    await startProbe(releases, 0, "apollo");

    expect(toggleFor("RocketReach")).toBeEnabled();
    expect(saveButton(1)).toBeEnabled();
    expect(removeButton(1)).toBeEnabled();
    expect(probeButton(1)).toBeEnabled();
  });

  it("hands the controls back once the probe answers", async () => {
    const releases = deferProbes();
    renderPair();
    await startProbe(releases, 0, "apollo");

    release(releases, "apollo", { ok: true, kind: "ok" });

    await waitFor(() => expect(screen.getByText(S.testOk)).toBeInTheDocument());
    expect(probeButton(0)).toBeEnabled();
    expect(toggleFor("Apollo")).toBeEnabled();
    expect(saveButton(0)).toBeEnabled();
    expect(removeButton(0)).toBeEnabled();
  });

  it("hands the controls back when the probe failed", async () => {
    const releases = deferProbes();
    renderPair();
    await startProbe(releases, 0, "apollo");

    release(releases, "apollo", { ok: false, error: { id: "E_ENRICH_011" } });

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_ENRICH_011"));
    await waitFor(() => expect(probeButton(0)).toBeEnabled());
    expect(toggleFor("Apollo")).toBeEnabled();
    expect(saveButton(0)).toBeEnabled();
    expect(removeButton(0)).toBeEnabled();
  });
});
