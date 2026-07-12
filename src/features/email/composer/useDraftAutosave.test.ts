// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let nextId = 0;
const saveMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: `d${++nextId}` } }));
const deleteMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "d1" } }));
vi.mock("../folderActions", () => ({
  saveDraftAction: (...a: unknown[]) => saveMock(...(a as [])),
  deleteDraftAction: (...a: unknown[]) => deleteMock(...(a as [])),
}));
// Runtime args are captured by the wrapper above; the mock's own type is arg-less, so read
// the recorded calls through an unknown[][] view to index the input payload.
const saveCalls = (): unknown[][] => saveMock.mock.calls;
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { useDraftAutosave } from "./useDraftAutosave";

const base = () => ({
  accountId: "acc",
  threadId: null as string | null,
  subject: "",
  body: "",
  toList: [] as string[],
  ccList: [] as string[],
  visibility: "shared" as const,
  initialDraftId: undefined as string | undefined,
  draftIdRef: { current: undefined as string | undefined },
  inFlightRef: { current: null as Promise<void> | null },
});

beforeEach(() => {
  vi.useFakeTimers();
  nextId = 0;
  saveMock.mockClear();
  deleteMock.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useDraftAutosave", () => {
  it("creates on first content change then updates by the same id (debounced upsert)", async () => {
    const props = { ...base(), subject: "Hi" };
    const { rerender } = renderHook((p) => useDraftAutosave(p), { initialProps: props });
    await vi.advanceTimersByTimeAsync(1600);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveCalls()[0]?.[1]).toMatchObject({
      id: undefined,
      accountId: "acc",
      subject: "Hi",
    });

    rerender({ ...props, subject: "Hi there", draftIdRef: props.draftIdRef });
    await vi.advanceTimersByTimeAsync(1600);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveCalls()[1]?.[1]).toMatchObject({ id: "d1", subject: "Hi there" });
  });

  it("does not reset the debounce on a re-render that changes no tracked field", async () => {
    // The 1.5s timer must count from the last EDIT, not the last render. An unrelated re-render
    // (a background query refetch, sibling state change) must not restart it.
    const props = { ...base(), subject: "Hi" };
    const { rerender } = renderHook((p) => useDraftAutosave(p), { initialProps: props });
    await vi.advanceTimersByTimeAsync(1000); // 1000 < 1500: not yet fired
    rerender({ ...props }); // same field values, fresh object literal
    await vi.advanceTimersByTimeAsync(1000); // total 2000: the original timer must have fired at 1500
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent autosaves so one composition cannot double-INSERT", async () => {
    let release!: () => void;
    saveMock.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ ok: true, value: { id: "d1" } }))),
    );
    const props = { ...base(), subject: "Hi" };
    const { rerender } = renderHook((p) => useDraftAutosave(p), { initialProps: props });
    await vi.advanceTimersByTimeAsync(1600); // first tick fires; the save hangs (in flight)
    expect(saveMock).toHaveBeenCalledTimes(1);
    rerender({ ...props, subject: "Hi there" });
    await vi.advanceTimersByTimeAsync(1600); // second tick sees a save in flight and skips
    expect(saveMock).toHaveBeenCalledTimes(1);
    release();
  });

  it("deletes the tracked draft when content becomes empty", async () => {
    const props = { ...base(), subject: "Hi" };
    const { rerender } = renderHook((p) => useDraftAutosave(p), { initialProps: props });
    await vi.advanceTimersByTimeAsync(1600);
    expect(saveMock).toHaveBeenCalledTimes(1);

    rerender({ ...props, subject: "", draftIdRef: props.draftIdRef });
    await vi.advanceTimersByTimeAsync(1600);
    expect(deleteMock).toHaveBeenCalledWith("csrf", { draftId: "d1" });
  });
});
