// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
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

import { setMappingAction } from "@/features/enrichment/settingsActions";
import { EnrichmentClient } from "./EnrichmentClient";
import { encodeTarget, NOT_MAPPED_VALUE } from "./targetOptions";

const S = ENRICHMENT_STRINGS.settings;
type ActionResult = { ok: true } | { ok: false; error: { id: string } };

const DOMAIN = encodeTarget({ kind: "builtin", key: "domain" });
const SEGMENT = encodeTarget({ kind: "custom", fieldDefId: "f1" });

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
  {
    canonicalKey: "org.industry",
    label: "Industry",
    value: NOT_MAPPED_VALUE,
    options: [
      { value: NOT_MAPPED_VALUE, label: S.mappingNotMapped },
      { value: SEGMENT, label: "Segment", group: S.mappingCustomGroup },
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

function renderMappings() {
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

function picker(label: string): HTMLElement {
  return screen.getByRole("combobox", { name: `${S.mappingOrganization} ${label}` });
}

// Map the domain row, the write an admin is most likely to change again straight away.
function startMapping(): void {
  fireEvent.click(picker("Website / domain"));
  fireEvent.click(screen.getByText("Domain field"));
}

function deferMapping(): (result: ActionResult) => void {
  let release: (result: ActionResult) => void = () => undefined;
  vi.mocked(setMappingAction).mockImplementationOnce(
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

describe("EnrichmentClient in-flight mapping writes", () => {
  it("locks the picker of the row whose write is in flight", async () => {
    deferMapping();
    renderMappings();
    startMapping();

    await waitFor(() => expect(picker("Website / domain")).toBeDisabled());
  });

  it("leaves the other mapping row and the rest of the page usable", async () => {
    deferMapping();
    renderMappings();
    startMapping();

    await waitFor(() => expect(picker("Website / domain")).toBeDisabled());
    expect(picker("Industry")).toBeEnabled();
    expect(screen.getByRole("switch", { name: `${S.enabledLabel}: Apollo` })).toBeEnabled();
    expect(screen.getByLabelText(S.cacheLabel)).toBeEnabled();
    expect(screen.getByRole("button", { name: S.cacheSave })).toBeEnabled();
  });

  it("hands the picker back once the write resolves", async () => {
    const release = deferMapping();
    renderMappings();
    startMapping();
    await waitFor(() => expect(picker("Website / domain")).toBeDisabled());

    release({ ok: true });

    await waitFor(() => expect(picker("Website / domain")).toBeEnabled());
  });

  it("hands the picker back when the write failed", async () => {
    const release = deferMapping();
    renderMappings();
    startMapping();
    await waitFor(() => expect(picker("Website / domain")).toBeDisabled());

    release({ ok: false, error: { id: "E_ENRICH_010" } });

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_ENRICH_010"));
    expect(picker("Website / domain")).toBeEnabled();
  });
});
