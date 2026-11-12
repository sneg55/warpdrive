// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { skipToken } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { intercom: { list: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));

import { IntercomEnabledProvider } from "./IntercomEnabledProvider";
import { useSupportConversations } from "./useSupportConversations";

const scope = { kind: "person" as const, personId: "p1" };
const row = { id: "c1" };

afterEach(cleanup);
beforeEach(() => {
  useQuery.mockReset();
  useQuery.mockReturnValue({ data: [row] });
});

function wrapper(enabled: boolean) {
  return ({ children }: { children: React.ReactNode }) => (
    <IntercomEnabledProvider enabled={enabled}>{children}</IntercomEnabledProvider>
  );
}

describe("useSupportConversations", () => {
  it("never enables the query and returns nothing without the provider", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useSupportConversations(scope));
    expect(result.current).toEqual([]);
    expect(useQuery).toHaveBeenCalledWith(skipToken);
  });

  it("stays off when the integration is disabled", () => {
    useQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useSupportConversations(scope), {
      wrapper: wrapper(false),
    });
    expect(result.current).toEqual([]);
    expect(useQuery).toHaveBeenCalledWith(skipToken);
  });

  it("queries the record's conversations when enabled", () => {
    const { result } = renderHook(() => useSupportConversations(scope), { wrapper: wrapper(true) });
    expect(result.current).toEqual([row]);
    expect(useQuery).toHaveBeenCalledWith({ scope });
  });

  it("stays off for a record with no scope", () => {
    renderHook(() => useSupportConversations(null), { wrapper: wrapper(true) });
    expect(useQuery).toHaveBeenCalledWith(skipToken);
  });
});
