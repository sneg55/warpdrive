// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sendMock = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
const deleteMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "d-new" } }));
vi.mock("../actions", () => ({ sendEmail: (...a: unknown[]) => sendMock(...(a as [])) }));
vi.mock("../folderActions", () => ({
  deleteDraftAction: (...a: unknown[]) => deleteMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/activities/actions", () => ({ createActivityAction: vi.fn() }));

import { buildSendHandlers } from "./useComposerSend";

type Deps = Parameters<typeof buildSendHandlers>[0];
function makeDeps(over: Partial<Deps>): Deps {
  return {
    accountId: "acc",
    resolvedThreadId: undefined,
    toList: ["a@y.com"],
    ccList: [],
    bccList: [],
    subject: "Hi",
    body: "<p>x</p>",
    trackOpens: false,
    trackLinks: false,
    signatureId: "",
    attachments: [],
    context: undefined,
    activityTypes: [],
    addAsActivity: false,
    setSending: vi.fn(),
    setError: vi.fn(),
    resetDraft: vi.fn(),
    onSent: vi.fn(),
    draftIdRef: { current: undefined },
    inFlightRef: { current: null },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  sendMock.mockClear();
  deleteMock.mockClear();
});
afterEach(() => vi.useRealTimers());

it("awaits an in-flight autosave before deleting, so a new draft created during send is not orphaned", async () => {
  const draftIdRef = { current: undefined as string | undefined };
  // A new-draft autosave is still in flight at send time; it sets draftIdRef when it resolves.
  const inFlightRef = {
    current: new Promise<void>((r) =>
      setTimeout(() => {
        draftIdRef.current = "d-new";
        r();
      }, 50),
    ) as Promise<void> | null,
  };
  const { handleSend } = buildSendHandlers(makeDeps({ draftIdRef, inFlightRef }));
  const p = handleSend();
  await vi.advanceTimersByTimeAsync(100); // let sendEmail resolve AND the in-flight save settle
  await p;
  expect(deleteMock).toHaveBeenCalledWith("csrf", { draftId: "d-new" });
});
