// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const setDealHeaderBlocksAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const })),
);
vi.mock("@/features/identity/preferencesActions", () => ({ setDealHeaderBlocksAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { useBlockVisibility } from "./useBlockVisibility";

it("defaults to all blocks visible and seeds hidden ids from the server pref", () => {
  const { result } = renderHook(() => useBlockVisibility(["details"]));
  expect(result.current.isHidden("summary")).toBe(false);
  expect(result.current.isHidden("details")).toBe(true);
});

it("toggling a block updates state and persists via the action", () => {
  const { result } = renderHook(() => useBlockVisibility([]));
  act(() => result.current.toggle("timeline"));
  expect(result.current.isHidden("timeline")).toBe(true);
  expect(setDealHeaderBlocksAction).toHaveBeenCalledWith({ blocks: ["timeline"] }, "csrf");
});
