// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type SendResult = { ok: true; value: object } | { ok: false; error: { id: string } };
const sendMock = vi.fn<(...a: unknown[]) => Promise<SendResult>>();
vi.mock("../actions", () => ({ sendEmail: (...a: unknown[]) => sendMock(...(a as [])) }));
vi.mock("../folderActions", () => ({
  deleteDraftAction: () => Promise.resolve({ ok: true, value: { id: "d" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/activities/actions", () => ({
  createActivityAction: () => Promise.resolve({ ok: true, value: { id: "a" } }),
}));
const captureMock = vi.fn();
vi.mock("@/features/observability/capture", () => ({
  capture: (...a: unknown[]) => captureMock(...(a as [])),
  currentRoute: () => "/deals/d1",
}));
const isStaleMock = vi.fn<(e: unknown) => boolean>();
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (e: unknown) => isStaleMock(e),
}));

import { ERROR_IDS } from "@/constants/errorIds";
import { EVENTS } from "@/features/observability/events";
import { COMPOSER_STRINGS } from "./composer.constants";
import { sendFailureMessage } from "./sendFailure";
import { buildSendHandlers } from "./useComposerSend";

type Deps = Parameters<typeof buildSendHandlers>[0];
function makeDeps(over: Partial<Deps> = {}): Deps {
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
  sendMock.mockReset();
  captureMock.mockReset();
  isStaleMock.mockReset();
  isStaleMock.mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

it("names the real cause instead of one generic sentence for every failure", async () => {
  sendMock.mockResolvedValue({ ok: false, error: { id: ERROR_IDS.GMAIL_GRANT_REVOKED } });
  const setError = vi.fn();
  await buildSendHandlers(makeDeps({ setError })).handleSend();
  expect(setError).toHaveBeenLastCalledWith(sendFailureMessage(ERROR_IDS.GMAIL_GRANT_REVOKED));
});

it("reports the failing error id to telemetry, so a send failure is visible without a box log", async () => {
  sendMock.mockResolvedValue({ ok: false, error: { id: ERROR_IDS.GMAIL_ATTACHMENT_DENIED } });
  await buildSendHandlers(makeDeps()).handleSend();
  expect(captureMock).toHaveBeenCalledWith(EVENTS.actionFailed, {
    errorId: ERROR_IDS.GMAIL_ATTACHMENT_DENIED,
    surface: "email-send",
    route: "/deals/d1",
    scheduled: false,
  });
});

it("tells a page that outlived its deploy to reload, and reports it as its own cause", async () => {
  isStaleMock.mockReturnValue(true);
  sendMock.mockRejectedValue(new Error("Server Action was not found on the server"));
  const setError = vi.fn();
  await buildSendHandlers(makeDeps({ setError })).handleSend();
  expect(setError).toHaveBeenLastCalledWith(sendFailureMessage(ERROR_IDS.UI_STALE_BUILD));
  expect(captureMock).toHaveBeenCalledWith(
    EVENTS.actionFailed,
    expect.objectContaining({ errorId: ERROR_IDS.UI_STALE_BUILD }),
  );
});

it("still refuses to assert failure when the action rejected for any other reason", async () => {
  sendMock.mockRejectedValue(new Error("network died"));
  const setError = vi.fn();
  await buildSendHandlers(makeDeps({ setError })).handleSend();
  expect(setError).toHaveBeenLastCalledWith(COMPOSER_STRINGS.sendUnconfirmed);
  expect(captureMock).toHaveBeenCalledWith(
    EVENTS.actionFailed,
    expect.objectContaining({ errorId: ERROR_IDS.UI_ACTION_UNCONFIRMED }),
  );
});

it("marks a scheduled send so the two paths can be told apart in telemetry", async () => {
  sendMock.mockResolvedValue({ ok: false, error: { id: ERROR_IDS.GMAIL_API_EXHAUSTED } });
  await buildSendHandlers(makeDeps()).handleSendLater(new Date(Date.now() + 60_000));
  expect(captureMock).toHaveBeenCalledWith(
    EVENTS.actionFailed,
    expect.objectContaining({ scheduled: true }),
  );
});

it("says nothing to telemetry when the send succeeds", async () => {
  sendMock.mockResolvedValue({ ok: true, value: {} });
  await buildSendHandlers(makeDeps()).handleSend();
  expect(captureMock).not.toHaveBeenCalled();
});
