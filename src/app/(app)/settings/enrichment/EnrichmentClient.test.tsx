// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";

const refresh = vi.fn();
const reportError = vi.fn();
const invalidateStatus = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/lib/trpc-client", () => ({
  trpc: { useUtils: () => ({ enrichment: { status: { invalidate: invalidateStatus } } }) },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
vi.mock("@/features/enrichment/settingsActions", () => ({
  setProviderKeyAction: vi.fn(() => Promise.resolve({ ok: true })),
  clearProviderKeyAction: vi.fn(() => Promise.resolve({ ok: true })),
  setProviderEnabledAction: vi.fn(() => Promise.resolve({ ok: true })),
  setMappingAction: vi.fn(() => Promise.resolve({ ok: true })),
  clearMappingAction: vi.fn(() => Promise.resolve({ ok: true })),
  setCacheTtlAction: vi.fn(() => Promise.resolve({ ok: true })),
  testProviderAction: vi.fn(
    (): Promise<{
      ok: true;
      kind: string;
      quotaRemaining?: { hourly?: number; daily?: number };
      notEntitled?: string[];
    }> => Promise.resolve({ ok: true, kind: "ok" }),
  ),
}));

import {
  clearMappingAction,
  setCacheTtlAction,
  setMappingAction,
  setProviderEnabledAction,
  testProviderAction,
} from "@/features/enrichment/settingsActions";
import { EnrichmentClient } from "./EnrichmentClient";
import { encodeTarget, NOT_MAPPED_VALUE } from "./targetOptions";

const S = ENRICHMENT_STRINGS.settings;
const DOMAIN = encodeTarget({ kind: "builtin", key: "domain" });
const CUSTOM = encodeTarget({ kind: "custom", fieldDefId: "11111111-1111-4111-8111-111111111111" });

const OPTIONS = [
  { value: NOT_MAPPED_VALUE, label: S.mappingNotMapped },
  { value: DOMAIN, label: "Website / domain", group: S.mappingBuiltinGroup },
  { value: CUSTOM, label: "Segment", group: S.mappingCustomGroup },
];

function renderClient() {
  render(
    <EnrichmentClient
      providers={[
        {
          provider: "apollo",
          name: "Apollo",
          enabled: false,
          hasKey: true,
          apiKeyHint: "9f2a",
          throttledUntilIso: null,
          throttleReason: null,
          needsAttention: false,
        },
      ]}
      person={{ entity: "person", title: S.mappingPerson, rows: [], hasCustomFields: false }}
      organization={{
        entity: "organization",
        title: S.mappingOrganization,
        rows: [
          {
            canonicalKey: "org.domain",
            label: "Website / domain",
            value: DOMAIN,
            options: OPTIONS,
          },
        ],
        hasCustomFields: true,
      }}
      cacheTtlDays={30}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("EnrichmentClient", () => {
  it("enables a provider and refreshes the page", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(setProviderEnabledAction).toHaveBeenCalledWith(
        { provider: "apollo", enabled: true },
        "csrf",
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("surfaces a failed mutation instead of silently doing nothing", async () => {
    vi.mocked(setProviderEnabledAction).mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ENRICH_NO_KEY" },
    });
    renderClient();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_ENRICH_NO_KEY"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("writes a chosen custom-field target through setMappingAction", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Segment"));
    await waitFor(() =>
      expect(setMappingAction).toHaveBeenCalledWith(
        {
          entity: "organization",
          canonicalKey: "org.domain",
          target: { kind: "custom", fieldDefId: "11111111-1111-4111-8111-111111111111" },
        },
        "csrf",
      ),
    );
  });

  it("clears a mapping through clearMappingAction when Not mapped is chosen", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(S.mappingNotMapped));
    await waitFor(() =>
      expect(clearMappingAction).toHaveBeenCalledWith(
        { entity: "organization", canonicalKey: "org.domain" },
        "csrf",
      ),
    );
  });

  it("shows the verdict and the remaining quota the test reported", async () => {
    vi.mocked(testProviderAction).mockResolvedValueOnce({
      ok: true,
      kind: "ok",
      quotaRemaining: { hourly: 0, daily: 1450 },
    });
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: S.test }));
    expect(await screen.findByText(S.testOk)).toBeInTheDocument();
    expect(
      screen.getByText(S.testQuotaLine(`${S.testQuotaHourly(0)}, ${S.testQuotaDaily(1450)}`)),
    ).toBeInTheDocument();
  });

  it("names the lookups the plan refuses next to a working key", async () => {
    vi.mocked(testProviderAction).mockResolvedValueOnce({
      ok: true,
      kind: "ok",
      quotaRemaining: { hourly: 199, daily: 599 },
      notEntitled: ["person"],
    });
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: S.test }));
    expect(await screen.findByText(S.testOk)).toBeInTheDocument();
    expect(screen.getByText(S.testNotEntitledLine(S.testLookupPerson))).toBeInTheDocument();
  });

  // A verdict describes the key that was tested. router.refresh keeps client state, so a stale
  // "Key works" would otherwise be claimed about a credential that was just replaced.
  it("forgets the verdict when the key is replaced", async () => {
    vi.mocked(testProviderAction).mockResolvedValueOnce({ ok: true, kind: "ok" });
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: S.test }));
    expect(await screen.findByText(S.testOk)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(S.apiKeyLabel), {
      target: { value: "sk-a-brand-new-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: S.save }));
    await waitFor(() => expect(screen.queryByText(S.testOk)).not.toBeInTheDocument());
  });

  it("forgets the verdict when the key is removed", async () => {
    vi.mocked(testProviderAction).mockResolvedValueOnce({ ok: true, kind: "ok" });
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: S.test }));
    expect(await screen.findByText(S.testOk)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: S.remove }));
    fireEvent.click(await screen.findByRole("button", { name: S.removeConfirm }));
    await waitFor(() => expect(screen.queryByText(S.testOk)).not.toBeInTheDocument());
  });

  // The cooldown clock is local wall-time and the comparison is against the local clock, so both
  // have to wait for the browser: server markup and the first client render must match.
  it("keeps the local cooldown clock out of the server markup and shows it after mount", async () => {
    const until = new Date(Date.now() + 60 * 60 * 1000);
    const hhmm = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`;
    const element = (
      <EnrichmentClient
        providers={[
          {
            provider: "apollo",
            name: "Apollo",
            enabled: true,
            hasKey: true,
            apiKeyHint: "9f2a",
            throttledUntilIso: until.toISOString(),
            throttleReason: "quota",
            needsAttention: false,
          },
        ]}
        person={{ entity: "person", title: S.mappingPerson, rows: [], hasCustomFields: false }}
        organization={{
          entity: "organization",
          title: S.mappingOrganization,
          rows: [],
          hasCustomFields: false,
        }}
        cacheTtlDays={30}
      />
    );
    expect(renderToStaticMarkup(element)).not.toContain(S.statusQuota(hhmm));
    render(element);
    expect(await screen.findByText(S.statusQuota(hhmm))).toBeInTheDocument();
  });

  it("saves the cache TTL as a number", async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText(S.cacheLabel), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: S.cacheSave }));
    await waitFor(() => expect(setCacheTtlAction).toHaveBeenCalledWith({ days: 7 }, "csrf"));
  });

  it("rejects a cache TTL that is not a whole number of days", async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText(S.cacheLabel), { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: S.cacheSave }));
    expect(await screen.findByText(S.cacheInvalid)).toBeInTheDocument();
    expect(setCacheTtlAction).not.toHaveBeenCalled();
  });

  // An empty field reads as zero to Number(), and zero is a legal TTL that turns the cache off, so
  // a cleared field would quietly start paying for every click.
  it.each(["", "   "])("rejects a blank cache TTL rather than disabling the cache", async (raw) => {
    renderClient();
    fireEvent.change(screen.getByLabelText(S.cacheLabel), { target: { value: raw } });
    fireEvent.click(screen.getByRole("button", { name: S.cacheSave }));
    expect(await screen.findByText(S.cacheInvalid)).toBeInTheDocument();
    expect(setCacheTtlAction).not.toHaveBeenCalled();
  });

  it("still saves a deliberate zero, which is how the cache is switched off", async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText(S.cacheLabel), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: S.cacheSave }));
    await waitFor(() => expect(setCacheTtlAction).toHaveBeenCalledWith({ days: 0 }, "csrf"));
    expect(screen.queryByText(S.cacheInvalid)).toBeNull();
  });
});

// EnrichButton holds enrichment.status for five minutes. router.refresh redraws this page only, so
// without an invalidation a provider connected here stays invisible on a record until it expires.
describe("EnrichmentClient status cache", () => {
  it("invalidates the enrichment status query after a provider mutation", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(invalidateStatus).toHaveBeenCalledTimes(1));
  });

  it("leaves the status query alone when the mutation failed", async () => {
    vi.mocked(setProviderEnabledAction).mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ENRICH_010" },
    });
    renderClient();
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(invalidateStatus).not.toHaveBeenCalled();
  });
});
