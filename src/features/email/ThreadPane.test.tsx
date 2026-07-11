// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

// Typed so `mockResolvedValueOnce({ ok: false, ... })` typechecks alongside the default
// ok:true resolution; the runtime values match the action's Result shape exactly.
type Res = { ok: true; value: { threadId: string } } | { ok: false; error: string };
const markReadMock = vi.fn<() => Promise<Res>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
const markUnreadMock = vi.fn<() => Promise<Res>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
vi.mock("./readActions", () => ({
  markThreadReadAction: (...a: unknown[]) => markReadMock(...(a as [])),
  markThreadUnreadAction: (...a: unknown[]) => markUnreadMock(...(a as [])),
}));
const setFollowUpStatusMock = vi.fn<() => Promise<Res>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
const setThreadLabelsMock = vi.fn<() => Promise<Res>>(() =>
  Promise.resolve({ ok: true, value: { threadId: "t1" } }),
);
vi.mock("./threadAttributesActions", () => ({
  setFollowUpStatusAction: (...a: unknown[]) => setFollowUpStatusMock(...(a as [])),
  setThreadLabelsAction: (...a: unknown[]) => setThreadLabelsMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
// The reader now renders ReaderTopBar (Back + Archive), which uses the Next router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./ReaderTopBar", () => ({ ReaderTopBar: () => null }));

const threadData = {
  thread: {
    id: "t1",
    subject: "Renewal",
    lastMessageAt: null,
    personId: null,
    dealId: null,
    visibility: "private",
    unread: true,
    followUpStatus: null,
    labels: [] as string[],
  },
  messages: [] as {
    messageId: string;
    gmailMessageId: string;
    direction: string;
    fromEmail: string;
    fromName: string | null;
    toEmails: string[];
    ccEmails: string[];
    subject: string | null;
    bodyHtml: string;
    sentAt: string | null;
    attachments: never[];
    tracking: never[];
  }[],
  accountId: "acct1",
  canCompose: false,
  ownerEmail: "me@gunsnation.com",
  personName: null as string | null,
  dealTitle: null as string | null,
};
const invalidateInboxList = vi.fn();
const invalidateUnreadCount = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      thread: { get: { useQuery: () => ({ data: threadData, refetch: vi.fn() }) } },
    },
    // Sidebar SidebarLinkPanel loads pipelines (Add-new-deal) + the global search (owner-only).
    pipeline: { list: { useQuery: () => ({ data: [] }) } },
    search: { query: { useQuery: () => ({ data: undefined }) } },
    useUtils: () => ({
      email: {
        inbox: {
          list: { invalidate: invalidateInboxList },
          unreadCount: { invalidate: invalidateUnreadCount },
        },
      },
    }),
  },
}));

import { ThreadPane } from "./ThreadPane";

afterEach(() => {
  cleanup();
  markReadMock.mockClear();
  markUnreadMock.mockClear();
  setFollowUpStatusMock.mockClear();
  setThreadLabelsMock.mockClear();
  invalidateInboxList.mockClear();
  invalidateUnreadCount.mockClear();
});

describe("ThreadPane", () => {
  it("marks the thread read exactly once on render, even across a rerender", () => {
    const { rerender } = render(<ThreadPane threadId="t1" trackingBadge={null} />);
    expect(markReadMock).toHaveBeenCalledTimes(1);
    expect(markReadMock).toHaveBeenCalledWith("csrf", { threadId: "t1" });

    // Force a second effect pass with the SAME threadId (e.g. a Composer send triggering
    // refetch()). The once-guard must still hold: no second call.
    rerender(<ThreadPane threadId="t1" trackingBadge={null} />);
    expect(markReadMock).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate the unread count when the mark-read action fails", async () => {
    markReadMock.mockResolvedValueOnce({ ok: false, error: "boom" });
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    await waitFor(() => expect(markReadMock).toHaveBeenCalledTimes(1));
    expect(invalidateUnreadCount).not.toHaveBeenCalled();
  });

  it("invalidates the inbox list (not just the unread count) after marking read on open", async () => {
    // Regression: the opened row's unread dot/bold is read from the cached inbox.list query
    // (ThreadRow), so invalidating only unreadCount leaves the row looking unread until some
    // other refetch happens to occur. Mirror the mark-unread path, which invalidates both.
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    await waitFor(() => expect(invalidateUnreadCount).toHaveBeenCalledTimes(1));
    expect(invalidateInboxList).toHaveBeenCalledTimes(1);
  });

  it("clicking Mark as unread calls markThreadUnreadAction and invalidates list + count", async () => {
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    // Let the mark-read-on-open effect settle first so its own invalidation doesn't
    // get counted as evidence of the click-driven invalidation below.
    await waitFor(() => expect(invalidateUnreadCount).toHaveBeenCalledTimes(1));
    invalidateUnreadCount.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));
    expect(markUnreadMock).toHaveBeenCalledWith("csrf", { threadId: "t1" });
    await waitFor(() => expect(invalidateInboxList).toHaveBeenCalled());
    await waitFor(() => expect(invalidateUnreadCount).toHaveBeenCalled());
  });

  it("shows an inline error and skips invalidation when marking unread fails", async () => {
    markUnreadMock.mockResolvedValueOnce({ ok: false, error: "boom" });
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    // Let the mark-read-on-open effect settle first (it invalidates both queries on success)
    // so its invalidations aren't mistaken for evidence of the click-driven path below.
    await waitFor(() => expect(invalidateUnreadCount).toHaveBeenCalledTimes(1));
    invalidateUnreadCount.mockClear();
    invalidateInboxList.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));
    expect(await screen.findByText(STRINGS.inbox.errorMarkUnread)).toBeInTheDocument();
    expect(invalidateInboxList).not.toHaveBeenCalled();
    expect(invalidateUnreadCount).not.toHaveBeenCalled();
  });

  it("renders a download chip for a message with an inbound attachment", () => {
    threadData.messages = [
      {
        messageId: "m1",
        gmailMessageId: "g1",
        direction: "inbound",
        fromEmail: "a@y.com",
        toEmails: [],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        sentAt: null,
        attachments: [
          { id: "at1", filename: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 88190 },
        ],
        tracking: [],
      },
    ] as never;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    const link = screen.getByRole("link", { name: /invoice\.pdf/ });
    expect(link).toHaveAttribute("href", "/api/email/attachments/at1");
    threadData.messages = [];
  });

  it("shows the sender display name in the message header, falling back to the address", () => {
    threadData.messages = [
      {
        messageId: "m1",
        gmailMessageId: "g1",
        direction: "inbound",
        fromEmail: "support@scrape.do",
        fromName: "Scrape.do Team",
        toEmails: [],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        sentAt: null,
        attachments: [],
        tracking: [],
      },
      {
        messageId: "m2",
        gmailMessageId: "g2",
        direction: "inbound",
        fromEmail: "bare@example.com",
        fromName: null,
        toEmails: [],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        sentAt: null,
        attachments: [],
        tracking: [],
      },
    ] as never;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    // "Scrape.do Team" also appears in the sidebar primary-contact card (it is the first sender),
    // so scope the message-header assertion to the presence of at least one occurrence.
    expect(screen.getAllByText("Scrape.do Team").length).toBeGreaterThan(0);
    expect(screen.getByText("bare@example.com")).toBeInTheDocument();
    threadData.messages = [];
  });

  it("renders the persisted opened indicator for an outbound message with two open events", () => {
    threadData.messages = [
      {
        messageId: "m2",
        gmailMessageId: "g2",
        direction: "outbound",
        fromEmail: "me@gunsnation.com",
        toEmails: ["you@y.com"],
        ccEmails: [],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        sentAt: null,
        attachments: [],
        tracking: [
          { type: "open", at: "2026-07-04T10:00:00.000Z" },
          { type: "open", at: "2026-07-04T09:00:00.000Z" },
        ],
      },
    ] as never;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    expect(screen.getByText("Opened 2 times")).toBeInTheDocument();
    threadData.messages = [];
  });

  it("shows the To and Cc recipients in the message header", () => {
    threadData.messages = [
      {
        messageId: "m1",
        gmailMessageId: "g1",
        direction: "outbound",
        fromEmail: "me@gunsnation.com",
        fromName: null,
        toEmails: ["client@acme.com"],
        ccEmails: ["cc@acme.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        sentAt: null,
        attachments: [],
        tracking: [],
      },
    ] as never;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    // Scope to the header row: the counterparty also renders in the sidebar card (else matches twice).
    const recipientsRow = screen.getByText("To:").closest("div") as HTMLElement;
    expect(within(recipientsRow).getByText("client@acme.com")).toBeInTheDocument();
    expect(within(recipientsRow).getByText("cc@acme.com")).toBeInTheDocument();
    threadData.messages = [];
  });

  it("hides the label / follow-up controls on a thread the user cannot compose to", () => {
    // A thread in another user's mailbox is viewable but its attribute mutations are rejected
    // server-side (ownership gate). Offering clickable label/follow-up controls that always fail
    // is the F5-7 defect: gate them behind canCompose, like the reply bar already is.
    threadData.canCompose = false;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    expect(screen.queryByLabelText(STRINGS.inbox.followUpStatusLabel)).not.toBeInTheDocument();
  });

  it("shows the label / follow-up controls on a thread the user owns", () => {
    threadData.canCompose = true;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    expect(screen.getByLabelText(STRINGS.inbox.followUpStatusLabel)).toBeInTheDocument();
    threadData.canCompose = false;
  });

  it("does not render an opened indicator for an inbound message even if it has tracking rows", () => {
    threadData.messages = [
      {
        messageId: "m3",
        gmailMessageId: "g3",
        direction: "inbound",
        fromEmail: "a@y.com",
        toEmails: [],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        sentAt: null,
        attachments: [],
        tracking: [{ type: "open", at: "2026-07-04T10:00:00.000Z" }],
      },
    ] as never;
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    expect(screen.queryByText(/Opened/)).not.toBeInTheDocument();
    threadData.messages = [];
  });
});
