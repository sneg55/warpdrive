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

// buildInput's linkDealId fallback (Task 6: inbox compose deal-linking sidebar). The `linkDealId`
// dep is the inbox's ComposeLinkSidebar selection; context.dealId is the deal-workspace composer's
// own deal. Both send paths must keep working after this change.
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

// C1: the composer's privacy pick must ride the send payload so the created thread lands with the
// chosen visibility. buildInput forwards deps.visibility as sendEmailInput.visibility.
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

// fireActivity's dealId (P2 review finding): an inbox compose can pin a deal via
// ComposeLinkSidebar (the linkDealId dep, same value buildInput uses for the email thread
// link). Add-as-activity must stay consistent with that link instead of always logging a
// standalone (dealId: null) activity for non-deal-context composes.
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
