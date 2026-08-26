// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
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

import { setProviderKeyAction } from "@/features/enrichment/settingsActions";
import { EnrichmentClient } from "./EnrichmentClient";

const S = ENRICHMENT_STRINGS.settings;
type ActionResult = { ok: true } | { ok: false; error: { id: string } };

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

function toggleFor(name: string): HTMLElement {
  return screen.getByRole("switch", { name: `${S.enabledLabel}: ${name}` });
}

function nth(items: HTMLElement[], index: number): HTMLElement {
  const found = items[index];
  expect(found).toBeDefined();
  return found as HTMLElement;
}

// Remove keeps its label while a mutation is in flight, so the cards are told apart by DOM order.
function removeButton(index: number): HTMLElement {
  return nth(screen.getAllByRole("button", { name: S.remove }), index);
}

// Saving the first card's key is the mutation an admin is most likely to interrupt.
function startSave(): void {
  fireEvent.change(nth(screen.getAllByLabelText(S.apiKeyLabel), 0), {
    target: { value: "sk-replacement-key" },
  });
  fireEvent.click(nth(screen.getAllByRole("button", { name: S.save }), 0));
}

function deferSave(): (result: ActionResult) => void {
  let release: (result: ActionResult) => void = () => undefined;
  vi.mocked(setProviderKeyAction).mockImplementationOnce(
    () =>
      new Promise<ActionResult>((resolve) => {
        release = resolve;
      }),
  );
  return (result) => release(result);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("EnrichmentClient in-flight mutations", () => {
  it("locks the toggle, Save and Remove of the provider whose mutation is in flight", async () => {
    deferSave();
    renderPair();
    startSave();

    expect(await screen.findByRole("button", { name: S.saving })).toBeDisabled();
    expect(toggleFor("Apollo")).toBeDisabled();
    expect(removeButton(0)).toBeDisabled();
  });

  it("leaves the other provider and the rest of the page usable", async () => {
    deferSave();
    renderPair();
    startSave();

    await screen.findByRole("button", { name: S.saving });
    expect(toggleFor("RocketReach")).toBeEnabled();
    expect(screen.getByRole("button", { name: S.save })).toBeEnabled();
    expect(removeButton(1)).toBeEnabled();
    expect(screen.getByLabelText(S.cacheLabel)).toBeEnabled();
    expect(screen.getByRole("button", { name: S.cacheSave })).toBeEnabled();
  });

  it("hands the controls back once the mutation resolves", async () => {
    const release = deferSave();
    renderPair();
    startSave();
    await screen.findByRole("button", { name: S.saving });

    release({ ok: true });

    await waitFor(() => expect(screen.getAllByRole("button", { name: S.save })).toHaveLength(2));
    expect(toggleFor("Apollo")).toBeEnabled();
    expect(removeButton(0)).toBeEnabled();
  });

  it("hands the controls back when the mutation failed", async () => {
    const release = deferSave();
    renderPair();
    startSave();
    await screen.findByRole("button", { name: S.saving });

    release({ ok: false, error: { id: "E_ENRICH_010" } });

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_ENRICH_010"));
    expect(toggleFor("Apollo")).toBeEnabled();
    expect(removeButton(0)).toBeEnabled();
    expect(screen.getAllByRole("button", { name: S.save })).toHaveLength(2);
  });
});
