// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { TestProviderActionResult } from "@/features/enrichment/settingsActions";
import type { MappingRow } from "./MappingTable";
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

import {
  setMappingAction,
  setProviderKeyAction,
  testProviderAction,
} from "@/features/enrichment/settingsActions";
import { EnrichmentClient } from "./EnrichmentClient";
import { encodeTarget, NOT_MAPPED_VALUE } from "./targetOptions";

const S = ENRICHMENT_STRINGS.settings;
type ActionResult = { ok: true } | { ok: false; error: { id: string } };
type Settle<T> = { resolve: (value: T) => void; reject: (reason: Error) => void };

const DOMAIN = encodeTarget({ kind: "builtin", key: "domain" });

const ROWS: MappingRow[] = [
  {
    canonicalKey: "org.domain",
    label: "Website / domain",
    value: NOT_MAPPED_VALUE,
    options: [
      { value: NOT_MAPPED_VALUE, label: S.mappingNotMapped },
      { value: DOMAIN, label: "Domain field", group: S.mappingBuiltinGroup },
    ],
  },
];

const PROVIDER: ProviderCardView = {
  provider: "apollo",
  name: "Apollo",
  enabled: false,
  hasKey: true,
  apiKeyHint: "9f2a",
  throttledUntilIso: null,
  throttleReason: null,
  needsAttention: false,
};

function renderPage() {
  render(
    <EnrichmentClient
      providers={[PROVIDER]}
      person={{ entity: "person", title: S.mappingPerson, rows: [], hasCustomFields: false }}
      organization={{
        entity: "organization",
        title: S.mappingOrganization,
        rows: ROWS,
        hasCustomFields: true,
      }}
      cacheTtlDays={30}
    />,
  );
}

function probeButton(): HTMLElement {
  return screen.getByRole("button", {
    name: (accessibleName: string) => accessibleName === S.test || accessibleName === S.testing,
  });
}

function toggle(): HTMLElement {
  return screen.getByRole("switch", { name: `${S.enabledLabel}: Apollo` });
}

function picker(): HTMLElement {
  return screen.getByRole("combobox", {
    name: `${S.mappingOrganization} Website / domain`,
  });
}

function deferProbe(): Settle<TestProviderActionResult> {
  const settle: Settle<TestProviderActionResult> = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  vi.mocked(testProviderAction).mockImplementationOnce(
    () =>
      new Promise<TestProviderActionResult>((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      }),
  );
  return settle;
}

function deferSave(): Settle<ActionResult> {
  const settle: Settle<ActionResult> = { resolve: () => undefined, reject: () => undefined };
  vi.mocked(setProviderKeyAction).mockImplementationOnce(
    () =>
      new Promise<ActionResult>((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      }),
  );
  return settle;
}

function deferMapping(): Settle<ActionResult> {
  const settle: Settle<ActionResult> = { resolve: () => undefined, reject: () => undefined };
  vi.mocked(setMappingAction).mockImplementationOnce(
    () =>
      new Promise<ActionResult>((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      }),
  );
  return settle;
}

function startSave(): void {
  fireEvent.change(screen.getByLabelText(S.apiKeyLabel), {
    target: { value: "sk-replacement-key" },
  });
  fireEvent.click(screen.getByRole("button", { name: S.save }));
}

function startMapping(): void {
  fireEvent.click(picker());
  fireEvent.click(screen.getByText("Domain field"));
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("EnrichmentClient rejected actions", () => {
  it("reports a connection test that rejects instead of answering", async () => {
    const probe = deferProbe();
    renderPage();
    fireEvent.click(probeButton());
    await waitFor(() => expect(probeButton()).toBeDisabled());

    probe.reject(new Error("network down"));

    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(S.testOk)).not.toBeInTheDocument();
  });

  it("hands the provider's controls back after a rejected connection test", async () => {
    const probe = deferProbe();
    renderPage();
    fireEvent.click(probeButton());
    await waitFor(() => expect(probeButton()).toBeDisabled());

    probe.reject(new Error("network down"));

    await waitFor(() => expect(probeButton()).toBeEnabled());
    expect(toggle()).toBeEnabled();
    expect(screen.getByRole("button", { name: S.save })).toBeEnabled();
    expect(screen.getByRole("button", { name: S.remove })).toBeEnabled();
  });

  it("reports a key save that rejects and hands the controls back", async () => {
    const save = deferSave();
    renderPage();
    startSave();
    await screen.findByRole("button", { name: S.saving });

    save.reject(new Error("network down"));

    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: S.save })).toBeEnabled());
    expect(toggle()).toBeEnabled();
  });

  it("reports a mapping write that rejects and hands the picker back", async () => {
    const mapping = deferMapping();
    renderPage();
    startMapping();
    await waitFor(() => expect(picker()).toBeDisabled());

    mapping.reject(new Error("network down"));

    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(picker()).toBeEnabled());
  });

  it("still reports the returned error id when the connection test fails cleanly", async () => {
    const probe = deferProbe();
    renderPage();
    fireEvent.click(probeButton());
    await waitFor(() => expect(probeButton()).toBeDisabled());

    probe.resolve({ ok: false, error: { id: "E_ENRICH_002" } });

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_ENRICH_002"));
    await waitFor(() => expect(probeButton()).toBeEnabled());
  });
});
