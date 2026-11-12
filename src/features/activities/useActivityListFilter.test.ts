// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { noFilter } from "./activityRowsTestHelpers";
import type { ActivityListFilter } from "./schemas";
import { useActivityListFilter } from "./useActivityListFilter";

const SEED: ActivityListFilter = {
  ...noFilter,
  ownerId: "u1",
  done: "done",
  from: "2026-01-01",
  to: "2026-12-31",
  dateBasis: "done",
  pipelineId: "p1",
};

describe("useActivityListFilter", () => {
  it("defaults to the current user's open activities on the due-date basis", () => {
    const { result } = renderHook(() => useActivityListFilter("me"));
    expect(result.current.filter).toMatchObject({
      ownerId: "me",
      done: "open",
      dateBasis: "due",
      pipelineId: null,
    });
  });

  it("starts ready on a seeded filter without waiting for the local clock", () => {
    const { result } = renderHook(() => useActivityListFilter("me", SEED));
    expect(result.current.ready).toBe(true);
    expect(result.current.filter).toEqual(SEED);
  });

  it("lets the user change a seeded filter", () => {
    const { result } = renderHook(() => useActivityListFilter("me", SEED));
    act(() => result.current.setFilter({ ...SEED, pipelineId: null }));
    expect(result.current.filter.pipelineId).toBeNull();
  });
});
