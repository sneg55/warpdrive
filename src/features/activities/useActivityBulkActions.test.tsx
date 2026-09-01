// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RowSelection } from "@/components/data-table/useRowSelection";

type ActionResult = { ok: true } | { ok: false; error: { id: string } };

const { completeActivityAction, deleteActivityAction } = vi.hoisted(() => ({
  completeActivityAction: vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true })),
  deleteActivityAction: vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true })),
}));
vi.mock("./actions", () => ({ completeActivityAction, deleteActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

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

import { useActivityBulkActions } from "./useActivityBulkActions";

afterEach(() => {
  vi.clearAllMocks();
});

function makeSelection(ids: readonly string[]): RowSelection {
  const selected = new Set(ids);
  return {
    selected,
    count: selected.size,
    isSelected: (id) => selected.has(id),
    toggle: vi.fn((id: string) => {
      selected.add(id);
    }),
    toggleAll: vi.fn(),
    clear: vi.fn(() => selected.clear()),
    allSelected: () => false,
  };
}

function renderActions(ids: readonly string[]) {
  const { result } = renderHook(() => useActivityBulkActions(makeSelection(ids)));
  return { result };
}

describe("useActivityBulkActions", () => {
  it("deletes every selected activity and refreshes the list once", async () => {
    const { result } = renderActions(["a1", "a2"]);
    await act(() => result.current.bulkDelete());
    expect(deleteActivityAction).toHaveBeenCalledTimes(2);
    expect(deleteActivityAction).toHaveBeenCalledWith({ id: "a1" }, "csrf");
    expect(invalidateListRows).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("invalidates the day load once for a whole successful bulk delete", async () => {
    const { result } = renderActions(["a1", "a2", "a3"]);
    await act(() => result.current.bulkDelete());
    expect(invalidateDayLoad).toHaveBeenCalledTimes(1);
  });

  it("leaves the day load alone when every delete is denied", async () => {
    deleteActivityAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const { result } = renderActions(["a1", "a2"]);
    await act(() => result.current.bulkDelete());
    expect(result.current.error).not.toBeNull();
    expect(invalidateDayLoad).not.toHaveBeenCalled();
    expect(invalidateListRows).not.toHaveBeenCalled();
    deleteActivityAction.mockResolvedValue({ ok: true });
  });

  it("still invalidates the day load when only some deletes succeed", async () => {
    deleteActivityAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    const { result } = renderActions(["a1", "a2"]);
    await act(() => result.current.bulkDelete());
    expect(invalidateDayLoad).toHaveBeenCalledTimes(1);
  });

  it("marks every selected activity done and refreshes the list once", async () => {
    const { result } = renderActions(["a1", "a2"]);
    await act(() => result.current.bulkMarkDone());
    expect(completeActivityAction).toHaveBeenCalledWith({ id: "a1", done: true }, "csrf");
    expect(completeActivityAction).toHaveBeenCalledTimes(2);
    expect(invalidateListRows).toHaveBeenCalledTimes(1);
  });

  it("invalidates the day load once for a whole successful bulk mark-done", async () => {
    const { result } = renderActions(["a1", "a2"]);
    await act(() => result.current.bulkMarkDone());
    expect(invalidateDayLoad).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the selection is empty", async () => {
    const { result } = renderActions([]);
    await act(() => result.current.bulkDelete());
    expect(deleteActivityAction).not.toHaveBeenCalled();
    expect(invalidateListRows).not.toHaveBeenCalled();
    expect(invalidateDayLoad).not.toHaveBeenCalled();
  });
});
