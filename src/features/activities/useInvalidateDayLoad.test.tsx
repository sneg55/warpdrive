// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { useUtils: () => ({ activities: { dayLoad: { invalidate } } }) },
}));

import { useInvalidateDayLoad } from "./useInvalidateDayLoad";

afterEach(() => {
  vi.clearAllMocks();
});

it("invalidates the activities.dayLoad query", async () => {
  const { result } = renderHook(() => useInvalidateDayLoad());
  await result.current();
  expect(invalidate).toHaveBeenCalledTimes(1);
});

it("invalidates every dayLoad input, not one assignee or month", async () => {
  const { result } = renderHook(() => useInvalidateDayLoad());
  await result.current();
  // No filter argument: a create can move load onto a month or an assignee this picker never read.
  expect(invalidate).toHaveBeenCalledWith();
});
