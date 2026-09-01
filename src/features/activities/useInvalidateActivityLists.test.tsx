// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { invalidateDayLoad, invalidateListRows } = vi.hoisted(() => ({
  invalidateDayLoad: vi.fn(() => Promise.resolve()),
  invalidateListRows: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: invalidateDayLoad },
        listRows: { invalidate: invalidateListRows },
      },
    }),
  },
}));

import { useInvalidateActivityLists } from "./useInvalidateActivityLists";

afterEach(() => {
  vi.clearAllMocks();
});

it("invalidates the activities.dayLoad query", async () => {
  const { result } = renderHook(() => useInvalidateActivityLists());
  await result.current();
  expect(invalidateDayLoad).toHaveBeenCalledTimes(1);
});

it("invalidates activities.listRows so a mounted Activities table refetches", async () => {
  const { result } = renderHook(() => useInvalidateActivityLists());
  await result.current();
  expect(invalidateListRows).toHaveBeenCalledTimes(1);
});

it("invalidates every dayLoad input, not one assignee or month", async () => {
  const { result } = renderHook(() => useInvalidateActivityLists());
  await result.current();
  // No filter argument: a create can move load onto a month or an assignee this picker never read.
  expect(invalidateDayLoad).toHaveBeenCalledWith();
});

it("invalidates every listRows input, not one filter or sort", async () => {
  const { result } = renderHook(() => useInvalidateActivityLists());
  await result.current();
  expect(invalidateListRows).toHaveBeenCalledWith();
});
