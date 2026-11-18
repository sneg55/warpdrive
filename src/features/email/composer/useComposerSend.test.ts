// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
const deleteMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "d-new" } }));
vi.mock("../actions", () => ({ sendEmail: (...a: unknown[]) => sendMock(...(a as [])) }));
vi.mock("../folderActions", () => ({
  deleteDraftAction: (...a: unknown[]) => deleteMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const createActivityMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "act-1" } }));
vi.mock("@/features/activities/actions", () => ({
  createActivityAction: (...a: unknown[]) => createActivityMock(...(a as [])),
}));

import { COMPOSER_STRINGS } from "./composer.constants";
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
    visibility: "shared",
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
  createActivityMock.mockClear();
});
afterEach(() => vi.useRealTimers());

it("awaits an in-flight autosave before deleting, so a new draft created during send is not orphaned", async () => {
  const draftIdRef = { current: undefined as string | undefined };
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
  await vi.advanceTimersByTimeAsync(100);
  await p;
  expect(deleteMock).toHaveBeenCalledWith("csrf", { draftId: "d-new" });
});

describe("buildInput linkDealId", () => {
  it("sends the linkDealId dep for a plain inbox compose (no deal context)", async () => {
    const { handleSend } = buildSendHandlers(makeDeps({ linkDealId: "sidebar-deal" }));
    await handleSend();
    expect(sendMock).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({ linkDealId: "sidebar-deal" }),
    );
  });

  it("falls back to context.dealId when no linkDealId dep is supplied (deal-workspace composer, unchanged)", async () => {
    const { handleSend } = buildSendHandlers(
      makeDeps({ context: { kind: "deal", dealId: "ctx-deal" } }),
    );
    await handleSend();
    expect(sendMock).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({ linkDealId: "ctx-deal" }),
    );
  });

  it("prefers the linkDealId dep over context.dealId when both are present", async () => {
    const { handleSend } = buildSendHandlers(
      makeDeps({ context: { kind: "deal", dealId: "ctx-deal" }, linkDealId: "sidebar-deal" }),
    );
    await handleSend();
    expect(sendMock).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({ linkDealId: "sidebar-deal" }),
    );
  });

  it("sends linkDealId undefined when neither the dep nor a deal context is present", async () => {
    const { handleSend } = buildSendHandlers(makeDeps({}));
    await handleSend();
    expect(sendMock).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({ linkDealId: undefined }),
    );
  });
});

describe("buildInput visibility", () => {
  it("sends the selected visibility (private) in the payload", async () => {
    const { handleSend } = buildSendHandlers(makeDeps({ visibility: "private" }));
    await handleSend();
    expect(sendMock).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({ visibility: "private" }),
    );
  });

  it("sends the default shared visibility when the user did not change it", async () => {
    const { handleSend } = buildSendHandlers(makeDeps({ visibility: "shared" }));
    await handleSend();
    expect(sendMock).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({ visibility: "shared" }),
    );
  });
});

describe("fireActivity dealId", () => {
  const activityTypes = [{ id: "type-email", key: "email" }];

  it("uses the linkDealId dep as the activity's dealId for a plain inbox compose (no deal context)", async () => {
    const { handleSend } = buildSendHandlers(
      makeDeps({ linkDealId: "sidebar-deal", addAsActivity: true, activityTypes }),
    );
    await handleSend();
    expect(createActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: "sidebar-deal" }),
      "csrf",
    );
  });

  it("keeps dealId null for a standalone inbox compose with no linkDealId (unchanged)", async () => {
    const { handleSend } = buildSendHandlers(makeDeps({ addAsActivity: true, activityTypes }));
    await handleSend();
    expect(createActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: null }),
      "csrf",
    );
  });

  it("logs the activity as already done, so a sent email counts as completed", async () => {
    const { handleSend } = buildSendHandlers(makeDeps({ addAsActivity: true, activityTypes }));
    await handleSend();
    expect(createActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ done: true }),
      "csrf",
    );
  });

  it("keeps using context.dealId for the deal-workspace composer, even when linkDealId is also present (unchanged)", async () => {
    const { handleSend } = buildSendHandlers(
      makeDeps({
        context: { kind: "deal", dealId: "ctx-deal" },
        linkDealId: "sidebar-deal",
        addAsActivity: true,
        activityTypes,
      }),
    );
    await handleSend();
    expect(createActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: "ctx-deal" }),
      "csrf",
    );
  });
});

describe("send action rejects instead of returning a Result", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  function abortError(): Error {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "AbortError";
    return e;
  }

  it("clears sending and surfaces an unconfirmed-send message when handleSend rejects", async () => {
    sendMock.mockImplementationOnce(() => Promise.reject(abortError()));
    const setSending = vi.fn();
    const setError = vi.fn();
    const { handleSend } = buildSendHandlers(makeDeps({ setSending, setError }));

    await expect(handleSend()).resolves.toBeUndefined();

    expect(setSending).toHaveBeenLastCalledWith(false);
    expect(setError).toHaveBeenLastCalledWith(COMPOSER_STRINGS.sendUnconfirmed);
  });

  it("clears sending and surfaces an unconfirmed-send message when handleSendLater rejects", async () => {
    sendMock.mockImplementationOnce(() => Promise.reject(abortError()));
    const setSending = vi.fn();
    const setError = vi.fn();
    const { handleSendLater } = buildSendHandlers(makeDeps({ setSending, setError }));

    await expect(handleSendLater(new Date(Date.now() + 60_000))).resolves.toBeUndefined();

    expect(setSending).toHaveBeenLastCalledWith(false);
    expect(setError).toHaveBeenLastCalledWith(COMPOSER_STRINGS.sendUnconfirmed);
  });

  it("keeps the draft intact when the send is unconfirmed, so nothing is lost", async () => {
    sendMock.mockImplementationOnce(() => Promise.reject(abortError()));
    const resetDraft = vi.fn();
    const { handleSend } = buildSendHandlers(makeDeps({ resetDraft }));

    await handleSend();

    expect(resetDraft).not.toHaveBeenCalled();
  });
});

it("sends against the person a resumed draft was written for, with no deal context present", async () => {
  const { handleSend } = buildSendHandlers(
    makeDeps({ linkDealId: "deal-9", linkPersonId: "person-9" }),
  );
  await handleSend();
  expect(sendMock).toHaveBeenCalledWith(
    "csrf",
    expect.objectContaining({ linkDealId: "deal-9", linkPersonId: "person-9" }),
  );
});
