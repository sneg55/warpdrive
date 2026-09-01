// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createActivityAction, editActivityAction, invalidateDayLoad } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  editActivityAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  invalidateDayLoad: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction, editActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: invalidateDayLoad },
        listRows: { invalidate: () => Promise.resolve() },
      },
    }),
    activities: {
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
      availability: { useQuery: () => ({ data: { busy: false } }) },
    },
    identity: { assignableUsers: { useQuery: () => ({ data: [{ id: "u1", name: "Me" }] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));

import { useActivityComposer } from "./useActivityComposer";

afterEach(() => {
  vi.clearAllMocks();
});

function setup() {
  return renderHook(() =>
    useActivityComposer({
      dealId: "d1",
      personId: null,
      orgId: null,
      onCreated: vi.fn(),
    }),
  );
}

function holdInvalidation(): { settle: () => Promise<void> } {
  let resolveInvalidation = (): void => {};
  const held = new Promise<void>((resolve) => {
    resolveInvalidation = () => {
      resolve();
    };
  });
  invalidateDayLoad.mockImplementationOnce(() => held);
  return {
    settle: async () => {
      resolveInvalidation();
      await held;
    },
  };
}

describe("useActivityComposer day load invalidation", () => {
  it("stays pending until the day load invalidation settles, so Save cannot be clicked twice", async () => {
    const invalidation = holdInvalidation();
    const { result } = setup();
    act(() => {
      result.current.setSubject("Call Ann");
      result.current.setSubjectEdited(true);
    });
    let submitted!: Promise<void>;
    act(() => {
      submitted = result.current.submit();
    });
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await invalidation.settle();
      await submitted;
    });
    expect(result.current.pending).toBe(false);
  });

  it("invalidates the day load after a successful create", async () => {
    const { result } = setup();
    act(() => {
      result.current.setSubject("Call Ann");
      result.current.setSubjectEdited(true);
    });
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(createActivityAction).toHaveBeenCalled());
    expect(invalidateDayLoad).toHaveBeenCalled();
  });

  it("does not invalidate the day load when the create fails", async () => {
    createActivityAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ACTIVITY_001" },
    } as never);
    const { result } = setup();
    act(() => {
      result.current.setSubject("Call Ann");
      result.current.setSubjectEdited(true);
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toContain("E_ACTIVITY_001");
    expect(invalidateDayLoad).not.toHaveBeenCalled();
  });

  it("does not invalidate the day load when validation rejects the draft before any write", async () => {
    const { result } = setup();
    act(() => {
      result.current.setSubjectEdited(true);
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(createActivityAction).not.toHaveBeenCalled();
    expect(invalidateDayLoad).not.toHaveBeenCalled();
  });
});
