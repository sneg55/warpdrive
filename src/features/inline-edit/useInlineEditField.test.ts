// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/types/result";
import type { InlineSaveResult } from "./useInlineEditField";
import { useInlineEditField } from "./useInlineEditField";

describe("useInlineEditField", () => {
  it("starts, edits a draft, and commits only when changed", () => {
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    expect(result.current.editing).toBe(true);
    act(() => result.current.setDraft("new"));
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    act(() => result.current.commit(onSave));
    expect(onSave).toHaveBeenCalledWith("new");
    expect(result.current.editing).toBe(false);
  });

  it("does not call onSave when the draft is unchanged", () => {
    const { result } = renderHook(() => useInlineEditField("same"));
    act(() => result.current.start());
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    act(() => result.current.commit(onSave));
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });

  it("cancel discards the draft", () => {
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("dirty"));
    act(() => result.current.cancel());
    expect(result.current.editing).toBe(false);
    expect(result.current.draft).toBe("old");
  });

  it("commits an explicit override value instead of draft (select/date autosave)", () => {
    const { result } = renderHook(() => useInlineEditField("old"));
    const onSave = vi.fn(() => Promise.resolve(ok(undefined)));
    act(() => result.current.commit(onSave, "picked"));
    expect(onSave).toHaveBeenCalledWith("picked");
    expect(result.current.editing).toBe(false);
  });

  it("tracks pending while the save is in flight, then clears it on success", async () => {
    let resolveSave: (r: InlineSaveResult) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<InlineSaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("new"));
    act(() => result.current.commit(onSave));
    expect(result.current.pending).toBe(true);
    act(() => resolveSave(ok(undefined)));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error when onSave resolves with ok:false", async () => {
    const onSave = vi.fn(() => Promise.resolve(err("E_DEAL_002")));
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("new"));
    act(() => result.current.commit(onSave));
    await waitFor(() => expect(result.current.error).toBe("E_DEAL_002"));
    expect(result.current.pending).toBe(false);
  });

  it("surfaces an error message when onSave throws/rejects", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("network down")));
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("new"));
    act(() => result.current.commit(onSave));
    await waitFor(() => expect(result.current.error).toBe("network down"));
  });

  it("clears a previous error when start() is called again", async () => {
    const onSave = vi.fn(() => Promise.resolve(err("boom")));
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("new"));
    act(() => result.current.commit(onSave));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    act(() => result.current.start());
    expect(result.current.error).toBeNull();
  });

  it("preserves the attempted draft when re-entering edit mode after a failed save", async () => {
    const onSave = vi.fn(() => Promise.resolve(err("boom")));
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("new"));
    act(() => result.current.commit(onSave));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    act(() => result.current.start());
    expect(result.current.editing).toBe(true);
    expect(result.current.draft).toBe("new");
  });

  it("ignores a second commit while a save is still pending", async () => {
    let resolveSave: (r: InlineSaveResult) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<InlineSaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { result } = renderHook(() => useInlineEditField("old"));
    act(() => result.current.start());
    act(() => result.current.setDraft("new"));
    act(() => result.current.commit(onSave));
    expect(result.current.pending).toBe(true);
    act(() => result.current.commit(onSave, "another"));
    expect(onSave).toHaveBeenCalledTimes(1);
    act(() => resolveSave(ok(undefined)));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });
});
