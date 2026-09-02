// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CustomFieldRefLabels } from "@/features/custom-fields/refLabelsShared";
import { useDealListRefLabels } from "./useDealListRefLabels";

const seed: CustomFieldRefLabels = { user: { u1: "Seed" }, person: {}, org: {} };
const completed: CustomFieldRefLabels = { user: { u2: "New" }, person: {}, org: {} };

describe("useDealListRefLabels", () => {
  it("starts from the seeded value on mount", () => {
    const { result } = renderHook(() => useDealListRefLabels(seed, undefined, false));
    expect(result.current).toEqual(seed);
  });

  it("replaces the map with a completed (non-placeholder) query result", () => {
    const { result, rerender } = renderHook(
      ({ fromQuery, isPlaceholderData }) =>
        useDealListRefLabels(seed, fromQuery, isPlaceholderData),
      {
        initialProps: {
          fromQuery: undefined as CustomFieldRefLabels | undefined,
          isPlaceholderData: false,
        },
      },
    );
    expect(result.current).toEqual(seed);
    rerender({ fromQuery: completed, isPlaceholderData: false });
    expect(result.current).toEqual(completed);
  });

  it("leaves the state unchanged when the query result is undefined (regression net for finding 1)", () => {
    const { result, rerender } = renderHook(
      ({ fromQuery, isPlaceholderData }) =>
        useDealListRefLabels(seed, fromQuery, isPlaceholderData),
      {
        initialProps: {
          fromQuery: undefined as CustomFieldRefLabels | undefined,
          isPlaceholderData: false,
        },
      },
    );
    rerender({ fromQuery: completed, isPlaceholderData: false });
    expect(result.current).toEqual(completed);
    rerender({ fromQuery: undefined, isPlaceholderData: false });
    expect(result.current).toEqual(completed);
  });

  it("starts from a completed cached query result already present on mount (regression net for finding 1)", () => {
    const seedWithExtra: CustomFieldRefLabels = { user: { u1: "Seed" }, person: {}, org: {} };
    const cachedWithExtra: CustomFieldRefLabels = {
      user: { u1: "Seed", u2: "Cached" },
      person: {},
      org: {},
    };
    const { result } = renderHook(() =>
      useDealListRefLabels(seedWithExtra, cachedWithExtra, false),
    );
    expect(result.current).toEqual(cachedWithExtra);
  });

  it("leaves the state unchanged while the query result is placeholder data", () => {
    const { result, rerender } = renderHook(
      ({ fromQuery, isPlaceholderData }) =>
        useDealListRefLabels(seed, fromQuery, isPlaceholderData),
      {
        initialProps: {
          fromQuery: seed,
          isPlaceholderData: false,
        },
      },
    );
    rerender({ fromQuery: completed, isPlaceholderData: true });
    expect(result.current).toEqual(seed);
  });
});
