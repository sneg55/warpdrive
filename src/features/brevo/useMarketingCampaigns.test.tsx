// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { skipToken } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { brevo: { list: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));

import { BrevoEnabledProvider } from "./BrevoEnabledProvider";
import { useMarketingCampaigns } from "./useMarketingCampaigns";

const scope = { kind: "person" as const, personId: "p1" };
const list = { items: [{ campaignId: 1 }], truncated: false };

afterEach(cleanup);
beforeEach(() => {
  useQuery.mockReset();
  useQuery.mockReturnValue({ data: list });
});

function wrapper(enabled: boolean) {
  return ({ children }: { children: React.ReactNode }) => (
    <BrevoEnabledProvider enabled={enabled}>{children}</BrevoEnabledProvider>
  );
}

describe("useMarketingCampaigns", () => {
  it("never enables the query and returns nothing without the provider", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useMarketingCampaigns(scope));
    expect(result.current).toEqual({ items: [], truncated: false });
    expect(useQuery).toHaveBeenCalledWith(skipToken);
  });

  it("stays off when the integration is disabled", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useMarketingCampaigns(scope), {
      wrapper: wrapper(false),
    });
    expect(result.current.items).toEqual([]);
    expect(useQuery).toHaveBeenCalledWith(skipToken);
  });

  it("queries the record's campaigns when enabled", () => {
    const { result } = renderHook(() => useMarketingCampaigns(scope), { wrapper: wrapper(true) });
    expect(result.current).toBe(list);
    expect(useQuery).toHaveBeenCalledWith({ scope });
  });

  it("stays off for a record with no scope", () => {
    renderHook(() => useMarketingCampaigns(null), { wrapper: wrapper(true) });
    expect(useQuery).toHaveBeenCalledWith(skipToken);
  });
});
