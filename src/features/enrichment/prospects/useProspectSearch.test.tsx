// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderOutcome } from "../providers/types";
import type { BadgedProspect } from "./types";
import { useProspectSearch } from "./useProspectSearch";
import { useProspectSelection } from "./useProspectSelection";

const OK: ProviderOutcome = { provider: "apollo", kind: "ok" };

function profile(providerRef: string): BadgedProspect {
  return {
    providerRef,
    fullName: `Person ${providerRef}`,
    hasEmail: true,
    hasPhone: false,
    match: { kind: "new" },
  };
}

function useHarness() {
  const selection = useProspectSelection();
  return useProspectSearch(["apollo"], selection);
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("useProspectSearch", () => {
  it("replaces page one with the fresh response instead of keeping stale cached rows", () => {
    const { result } = renderHook(useHarness);

    act(() => {
      result.current.search();
    });
    act(() => {
      result.current.absorbPage([profile("cached-1"), profile("cached-2")], false, OK);
    });
    expect(result.current.profiles.map((p) => p.providerRef)).toEqual(["cached-1", "cached-2"]);

    act(() => {
      result.current.absorbPage([profile("fresh-1")], false, OK);
    });

    expect(result.current.profiles.map((p) => p.providerRef)).toEqual(["fresh-1"]);
  });

  it("still appends when a later page is absorbed after load more", () => {
    const { result } = renderHook(useHarness);

    act(() => {
      result.current.search();
    });
    act(() => {
      result.current.absorbPage([profile("p1")], false, OK);
    });
    act(() => {
      result.current.loadMore();
    });
    act(() => {
      result.current.absorbPage([profile("p2")], false, OK);
    });

    expect(result.current.profiles.map((p) => p.providerRef)).toEqual(["p1", "p2"]);
  });
});
