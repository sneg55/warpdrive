// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditableActivity } from "@/features/activities/getForEdit";

const STALE = new Error("Server Action was not found on the server");
type Outcome = { ok: true } | { ok: false; error: { id: string } };
const { createActivityAction, editActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn<() => Promise<Outcome>>(),
  editActivityAction: vi.fn<() => Promise<Outcome>>(),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction, editActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: () => Promise.resolve() },
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

const EDITING = {
  id: "a1",
  typeId: "t1",
  subject: "Existing",
  priority: "",
  dueAt: "2026-11-20T10:00:00.000Z",
  allDay: false,
  endAt: null,
  location: "",
  note: "",
  videoCallUrl: "",
  assigneeId: "u1",
  guestPersonIds: [],
  dealId: "d1",
  personId: null,
  orgId: null,
  done: false,
} as unknown as EditableActivity;

function setup(editing: EditableActivity | null = null, onCreated = vi.fn()) {
  return renderHook(() =>
    useActivityComposer({ dealId: "d1", personId: null, orgId: null, onCreated, editing }),
  );
}

async function submitWithSubject(
  result: ReturnType<typeof setup>["result"],
  subject: string,
): Promise<void> {
  act(() => {
    result.current.setSubject(subject);
    result.current.setSubjectEdited(true);
  });
  await act(async () => {
    await result.current.submit();
  });
}

describe("useActivityComposer failures", () => {
  it("surfaces a rejected create as unconfirmed, re-enables, and keeps the subject", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createActivityAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const onCreated = vi.fn();
    const { result } = setup(null, onCreated);
    await submitWithSubject(result, "Call Ann");
    expect(result.current.error).toMatch(/could not confirm the activity was created/i);
    expect(result.current.error).toContain("E_UI_003");
    expect(result.current.pending).toBe(false);
    expect(result.current.subjectValue).toBe("Call Ann");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("asks for a reload when the create action is missing from the build", async () => {
    createActivityAction.mockRejectedValueOnce(STALE);
    const { result } = setup();
    await submitWithSubject(result, "Call Ann");
    expect(result.current.error).toMatch(/reload the page/i);
    expect(result.current.error).toContain("E_UI_002");
    expect(result.current.pending).toBe(false);
  });

  it("surfaces a rejected edit as unconfirmed and keeps the edit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    editActivityAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = setup(EDITING);
    await submitWithSubject(result, "Edited subject");
    expect(result.current.error).toMatch(/could not confirm the activity was saved/i);
    expect(result.current.pending).toBe(false);
    expect(result.current.subjectValue).toBe("Edited subject");
  });

  it("keeps the returned-error message for a create", async () => {
    createActivityAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_003" } });
    const { result } = setup();
    await submitWithSubject(result, "Call Ann");
    expect(result.current.error).toBe("Could not create activity (E_DB_003)");
    expect(result.current.pending).toBe(false);
  });
});
