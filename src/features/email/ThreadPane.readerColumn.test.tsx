// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

// U2 reader reading column: message card, width constraint, and reply-bar placement (B10 + B8).
// Kept in its own file so ThreadPane.test.tsx (mark-read / attributes behavior) stays under the
// file-size cap. Same trpc/action mocks as ThreadPane.test.tsx, trimmed to what the layout needs.

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
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./ReaderTopBar", () => ({ ReaderTopBar: () => null }));
// The reply footer opens the real Composer only after a click; stub it so importing ReaderActions
// does not require exercising the composer tree for these layout-only assertions.
vi.mock("./composer/Composer", () => ({ Composer: () => <div data-testid="composer-stub" /> }));

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
  messages: [
    {
      messageId: "m1",
      gmailMessageId: "g1",
      direction: "inbound",
      fromEmail: "ann@acme.com",
      fromName: "Ann Acme",
      toEmails: [],
      ccEmails: [],
      subject: "Hi",
      bodyHtml: "<p>hi</p>",
      sentAt: null,
      attachments: [],
      tracking: [],
    },
  ],
  accountId: "acct1",
  canCompose: true,
  ownerEmail: "me@gunsnation.com",
  personName: null as string | null,
  dealTitle: null as string | null,
};
vi.mock("./mailLabelsActions", () => ({ createMailLabelAction: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: { thread: { get: { useQuery: () => ({ data: threadData, refetch: vi.fn() }) } } },
    pipeline: { list: { useQuery: () => ({ data: [] }) } },
    search: { query: { useQuery: () => ({ data: undefined }) } },
    useUtils: () => ({
      mailLabels: { list: { invalidate: vi.fn() } },
      email: {
        inbox: {
          list: { invalidate: vi.fn() },
          unreadCount: { invalidate: vi.fn() },
        },
      },
    }),
  },
}));

import { ThreadPane } from "./ThreadPane";

afterEach(cleanup);

describe("ThreadPane reader reading column (U2)", () => {
  it("wraps each reader message in a bordered card (B10)", () => {
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    const card = screen.getByTestId("reader-message-card");
    // Sender name lives inside the card; the enclosing article is a bordered, rounded card,
    // not a flat full-width article.
    expect(within(card).getByText("Ann Acme")).toBeInTheDocument();
    expect(card).toHaveClass("border", "rounded-md");
  });

  it("constrains the reader content column with a max-width, not the full pane (B10)", () => {
    const { container } = render(<ThreadPane threadId="t1" trackingBadge={null} />);
    const column = container.querySelector("[data-reader-column]");
    expect(column).not.toBeNull();
    expect((column as HTMLElement).className).toMatch(/max-w-/);
  });

  it("renders the reply control INSIDE the message scroll region, not as a trailing sibling (B8 pin)", () => {
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    const replyBtn = screen.getByRole("button", { name: STRINGS.inbox.replyAction });
    // The reply control's ancestor chain must include the scroll container. Before U2, ReaderActions
    // was a sibling rendered AFTER the scroller, so this closest() would be null.
    const scroll = replyBtn.closest("[data-reader-scroll]");
    expect(scroll).not.toBeNull();
    // The message card sits inside that same scroller.
    expect(screen.getByTestId("reader-message-card").closest("[data-reader-scroll]")).toBe(scroll);
  });

  it("places the reply bar in the same column as the message on a single-message thread (no footer gap)", () => {
    render(<ThreadPane threadId="t1" trackingBadge={null} />);
    const card = screen.getByTestId("reader-message-card");
    const footer = screen.getByTestId("reader-reply-footer");
    // Reply footer and message card are siblings in the constrained column (footer flows directly
    // under the body), not separated by a flex-1 spacer that floats it to the page bottom.
    expect(footer.parentElement).toBe(card.parentElement);
    expect(card.parentElement).toHaveAttribute("data-reader-column");
  });
});
