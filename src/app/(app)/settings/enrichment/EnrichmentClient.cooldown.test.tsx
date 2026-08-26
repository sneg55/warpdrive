// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { ProviderCardView } from "./ProviderCard";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ enrichment: { status: { invalidate: () => Promise.resolve() } } }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));
vi.mock("@/features/enrichment/settingsActions", () => ({
  setProviderKeyAction: vi.fn(() => Promise.resolve({ ok: true })),
  clearProviderKeyAction: vi.fn(() => Promise.resolve({ ok: true })),
  setProviderEnabledAction: vi.fn(() => Promise.resolve({ ok: true })),
  setMappingAction: vi.fn(() => Promise.resolve({ ok: true })),
  clearMappingAction: vi.fn(() => Promise.resolve({ ok: true })),
  setCacheTtlAction: vi.fn(() => Promise.resolve({ ok: true })),
  testProviderAction: vi.fn(() => Promise.resolve({ ok: true, kind: "ok" })),
}));

import { EnrichmentClient } from "./EnrichmentClient";

const S = ENRICHMENT_STRINGS.settings;
const MOUNTED_AT = new Date("2026-08-24T09:00:00Z");

function hhmm(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function clientWith(providers: ProviderCardView[]) {
  return (
    <EnrichmentClient
      providers={providers}
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
}

function renderCooldown(providers: ProviderCardView[]) {
  return render(clientWith(providers));
}

function throttled(provider: string, name: string, until: Date): ProviderCardView {
  return {
    provider,
    name,
    enabled: true,
    hasKey: true,
    apiKeyHint: "9f2a",
    throttledUntilIso: until.toISOString(),
    throttleReason: "quota",
    needsAttention: false,
  };
}

function idle(provider: string, name: string): ProviderCardView {
  return {
    provider,
    name,
    enabled: true,
    hasKey: true,
    apiKeyHint: "9f2a",
    throttledUntilIso: null,
    throttleReason: null,
    needsAttention: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOUNTED_AT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EnrichmentClient cooldown clock", () => {
  it("drops the cooldown line once the cooldown passes, with no reload", async () => {
    const until = new Date("2026-08-24T09:01:00Z");
    renderCooldown([throttled("apollo", "Apollo", until)]);
    expect(screen.getByText(S.statusQuota(hhmm(until)))).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(screen.queryByText(S.statusQuota(hhmm(until)))).toBeNull();
    expect(screen.getByText(S.statusEnabled)).toBeInTheDocument();
  });

  it("waits for each provider's own cooldown rather than clearing them together", async () => {
    const soon = new Date("2026-08-24T09:01:00Z");
    const later = new Date("2026-08-24T09:10:00Z");
    renderCooldown([
      throttled("apollo", "Apollo", soon),
      throttled("rocketreach", "RocketReach", later),
    ]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.queryByText(S.statusQuota(hhmm(soon)))).toBeNull();
    expect(screen.getByText(S.statusQuota(hhmm(later)))).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * 60_000);
    });
    expect(screen.queryByText(S.statusQuota(hhmm(later)))).toBeNull();
  });

  it("measures a cooldown that arrives after mount against the live clock", async () => {
    const { rerender } = renderCooldown([idle("apollo", "Apollo")]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    // The cooldown a connection test just recorded, arriving through router.refresh.
    const until = new Date("2026-08-24T09:06:00Z");
    rerender(clientWith([throttled("apollo", "Apollo", until)]));
    expect(screen.getByText(S.statusQuota(hhmm(until)))).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(screen.queryByText(S.statusQuota(hhmm(until)))).toBeNull();
    expect(screen.getByText(S.statusEnabled)).toBeInTheDocument();
  });

  it("leaves no timer running once every cooldown has passed", async () => {
    renderCooldown([throttled("apollo", "Apollo", new Date("2026-08-24T09:01:00Z"))]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no timer running after unmount", () => {
    const { unmount } = renderCooldown([
      throttled("apollo", "Apollo", new Date("2026-08-24T09:01:00Z")),
    ]);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
