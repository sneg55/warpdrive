// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./readActions", () => ({
  markThreadReadAction: () => Promise.resolve({ ok: true, value: { threadId: "t1" } }),
  markThreadUnreadAction: () => Promise.resolve({ ok: true, value: { threadId: "t1" } }),
}));
vi.mock("./threadVisibilityActions", () => ({ setThreadVisibilityAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./ReaderTopBar", () => ({ ReaderTopBar: () => null }));
vi.mock("./ReaderMessageCard", () => ({ ReaderMessageCard: () => null }));
vi.mock("./ThreadFollowUpControls", () => ({ ThreadFollowUpControls: () => null }));
vi.mock("./ThreadPrivacyToggle", () => ({ ThreadPrivacyToggle: () => null }));
vi.mock("./ReaderActions", () => ({
  ReaderActions: ({ onSent }: { onSent: () => void }) => (
    <button type="button" onClick={onSent}>
      reader-sent
    </button>
  ),
}));
vi.mock("./InboxReaderSidebar", () => ({
  InboxReaderSidebar: ({ onLinked }: { onLinked: () => void }) => (
    <button type="button" onClick={onLinked}>
      reader-linked
    </button>
  ),
}));

const threadData = {
  thread: {
    id: "t1",
    subject: "Renewal",
    lastMessageAt: null,
    personId: null,
    dealId: null,
    visibility: "private",
    unread: false,
    followUpStatus: null,
    labels: [] as string[],
  },
  messages: [
    {
      messageId: "m1",
      gmailMessageId: "g1",
      direction: "inbound",
      fromEmail: "them@example.com",
      fromName: null,
      toEmails: ["me@example.com"],
      ccEmails: [],
      subject: "Renewal",
      bodyHtml: "",
      sentAt: null,
      attachments: [],
      tracking: [],
    },
  ],
  accountId: "acct1",
  canCompose: true,
  ownerEmail: "me@example.com",
  personName: null as string | null,
  dealTitle: null as string | null,
};

const invalidateDealMessages = vi.fn(() => Promise.resolve());
const invalidateContactMessages = vi.fn(() => Promise.resolve());
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: { thread: { get: { useQuery: () => ({ data: threadData, refetch: vi.fn() }) } } },
    useUtils: () => ({
      email: {
        inbox: { list: { invalidate: vi.fn() }, unreadCount: { invalidate: vi.fn() } },
        listMessagesForDeal: { invalidate: invalidateDealMessages },
        listMessagesForContact: { invalidate: invalidateContactMessages },
      },
    }),
  },
}));

import { ThreadPane } from "./ThreadPane";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("refreshes the record timelines after a reply sent from the reader", () => {
  render(<ThreadPane threadId="t1" trackingBadge={null} />);
  fireEvent.click(screen.getByRole("button", { name: "reader-sent" }));

  expect(invalidateDealMessages).toHaveBeenCalledTimes(1);
  expect(invalidateContactMessages).toHaveBeenCalledTimes(1);
});

it("refreshes the record timelines after the thread's linked deal or person changes", () => {
  render(<ThreadPane threadId="t1" trackingBadge={null} />);
  fireEvent.click(screen.getByRole("button", { name: "reader-linked" }));

  expect(invalidateDealMessages).toHaveBeenCalledTimes(1);
  expect(invalidateContactMessages).toHaveBeenCalledTimes(1);
});
