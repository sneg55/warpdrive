// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadRow } from "../leadRepo";

const STALE = new Error("Server Action was not found on the server");
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

type Result<T> = { ok: true; value: T } | { ok: false; error: { id: string } };
const actions = vi.hoisted(() => ({
  convertLeadAction: vi.fn<() => Promise<Result<{ dealId: string }>>>(),
  bulkConvertLeadsAction:
    vi.fn<
      () => Promise<
        Result<{ converted: number; skipped: number; failed: number; failureId: string | null }>
      >
    >(),
}));
vi.mock("../leadServerActions", () => actions);

import { useLeadConvert } from "./useLeadConvert";

const ROW = { id: "l1", updatedAt: new Date("2026-06-01T00:00:00Z") } as unknown as LeadRow;

function setup() {
  const deps = {
    refetch: vi.fn(() => Promise.resolve()),
    clearSelection: vi.fn(),
    goToDeal: vi.fn(),
  };
  return { deps, hook: renderHook(() => useLeadConvert(deps)) };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("useLeadConvert single convert failures", () => {
  it("shows an unconfirmed banner when the action rejects, then converts on retry", async () => {
    actions.convertLeadAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    actions.convertLeadAction.mockResolvedValueOnce({ ok: true, value: { dealId: "d1" } });
    const { deps, hook } = setup();

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.convertRow(ROW);
    });
    expect(outcome).toMatchObject({ ok: false, id: "E_UI_003" });
    expect(hook.result.current.convertError).toMatch(/could not confirm the lead was converted/i);
    expect(deps.refetch).toHaveBeenCalled();
    expect(deps.goToDeal).not.toHaveBeenCalled();

    await act(async () => {
      outcome = await hook.result.current.convertRow(ROW);
    });
    expect(outcome).toEqual({ ok: true });
    expect(deps.goToDeal).toHaveBeenCalledWith("d1");
  });

  it("asks for a reload on a stale build", async () => {
    actions.convertLeadAction.mockRejectedValueOnce(STALE);
    const { hook } = setup();
    await act(async () => {
      await hook.result.current.convertRow(ROW);
    });
    expect(hook.result.current.convertError).toMatch(/reload the page/i);
  });

  it("keeps the failure out of the banner when the dialog owns the message", async () => {
    actions.convertLeadAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_003" } });
    const { hook } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.convertRow(ROW, {}, "dialog");
    });
    expect(outcome).toMatchObject({ ok: false, id: "E_DB_003" });
    expect((outcome as { message: string }).message).toContain("E_DB_003");
    expect(hook.result.current.convertError).toBeNull();
  });
});

describe("useLeadConvert bulk failures", () => {
  it("reports per-item failures without abandoning the converted ones", async () => {
    actions.bulkConvertLeadsAction.mockResolvedValueOnce({
      ok: true,
      value: { converted: 2, skipped: 0, failed: 1, failureId: "E_DB_003" },
    });
    const { deps, hook } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.bulkConvert(["a", "b", "c"], {}, "dialog");
    });
    expect(outcome).toEqual({ ok: true });
    expect(deps.clearSelection).toHaveBeenCalled();
    expect(deps.refetch).toHaveBeenCalled();
    expect(hook.result.current.convertError).toMatch(/2 leads converted/);
    expect(hook.result.current.convertError).toMatch(/1 could not be converted/);
    expect(hook.result.current.convertError).toContain("E_DB_003");
  });

  it("shows no banner when every item converts", async () => {
    actions.bulkConvertLeadsAction.mockResolvedValueOnce({
      ok: true,
      value: { converted: 3, skipped: 0, failed: 0, failureId: null },
    });
    const { hook } = setup();
    await act(async () => {
      await hook.result.current.bulkConvert(["a", "b", "c"]);
    });
    expect(hook.result.current.convertError).toBeNull();
  });

  it("shows an unconfirmed banner and keeps the selection when the bulk action rejects", async () => {
    actions.bulkConvertLeadsAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { deps, hook } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.bulkConvert(["a", "b"]);
    });
    expect(outcome).toMatchObject({ ok: false, id: "E_UI_003" });
    expect(hook.result.current.convertError).toMatch(/could not confirm/i);
    expect(deps.clearSelection).not.toHaveBeenCalled();
    expect(deps.refetch).toHaveBeenCalled();
    expect(hook.result.current.bulkConvertPending).toBe(false);
  });

  it("surfaces a returned bulk error id", async () => {
    actions.bulkConvertLeadsAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_DB_003" },
    });
    const { hook } = setup();
    await act(async () => {
      await hook.result.current.bulkConvert(["a"]);
    });
    expect(hook.result.current.convertError).toContain("E_DB_003");
    expect(hook.result.current.bulkConvertPending).toBe(false);
  });
});
