// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTimelineMessage } from "./entityMessageReads";
import { formatTimelineEmailDate } from "./inboxDate";

const useQuery = vi.fn();
const invalidateDeal = vi.fn();
const invalidateContact = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: { message: { get: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
    useUtils: () => ({
      email: {
        listMessagesForDeal: { invalidate: invalidateDeal },
        listMessagesForContact: { invalidate: invalidateContact },
      },
    }),
  },
}));
const linkThread = vi.fn();
vi.mock("./linkActions", () => ({ linkThread: (...a: unknown[]) => linkThread(...a) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
// ReaderMessageCard and ReaderActions are covered by their own tests; stub them so this file
// asserts the card's own behavior (collapse, fetch-on-expand, menu wiring) and not theirs.
vi.mock("./ReaderMessageCard", () => ({
  ReaderMessageCard: () => <div data-testid="reader-message-card" />,
}));
// The stub seeds its own state from initialMode exactly as the real ReaderActions does, so a mode
// that changes while the composer is already mounted only takes effect if the card remounts it.
const readerActionsProps = vi.fn();
vi.mock("./ReaderActions", async () => {
  const { useState } = await import("react");
  return {
    ReaderActions: (props: { initialMode?: string; onSent?: () => void }) => {
      readerActionsProps(props);
      const [seeded] = useState(props.initialMode ?? "none");
      return (
        <div data-testid="reader-reply">
          {seeded}
          <button type="button" data-testid="reader-sent" onClick={() => props.onSent?.()}>
            send
          </button>
        </div>
      );
    },
  };
});

import { EmailTimelineCard } from "./EmailTimelineCard";

afterEach(cleanup);
beforeEach(() => {
  useQuery.mockReset();
  linkThread.mockReset();
  readerActionsProps.mockReset();
  useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

const message: EmailTimelineMessage = {
  messageId: "m1",
  threadId: "t1",
  subject: "Follow up to our meeting",
  sentAt: "2026-08-18T17:04:00Z",
  createdAt: "2026-08-18T17:04:01Z",
  direction: "inbound",
  fromEmail: "chris@pipedrive.com",
  fromName: "Christopher Ramirez",
  toEmails: ["jenny@example.com"],
  snippet: "Hello Mr. Ramirez! What an honor.",
  hasAttachment: false,
  canCompose: true,
};

const dealScope = { kind: "deal", dealId: "d1" } as const;

describe("EmailTimelineCard collapsed", () => {
  it("shows subject, sender, recipient and snippet", () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    expect(screen.getByText("Follow up to our meeting")).toBeInTheDocument();
    expect(screen.getByText(/Christopher Ramirez/)).toBeInTheDocument();
    expect(screen.getByText(/jenny@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Hello Mr. Ramirez/)).toBeInTheDocument();
  });

  // mergeEmailItems orders a message with no Gmail Date header by createdAt, so the card has to
  // date it the same way instead of rendering an empty date behind a leading separator.
  it("dates a message with no Date header by when it arrived", () => {
    const undated = { ...message, sentAt: null, createdAt: "2026-06-01T09:15:00Z" };
    render(<EmailTimelineCard message={undated} scope={dealScope} onUnlinked={() => {}} />);

    expect(screen.getByText(formatTimelineEmailDate("2026-06-01T09:15:00Z"))).toBeInTheDocument();
  });

  it("issues no body query while collapsed", () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    expect(useQuery).toHaveBeenCalledWith(
      { messageId: "m1", allowRemote: false },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("renders no body and no reply control while collapsed", () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    expect(screen.queryByTestId("reader-message-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reader-reply")).not.toBeInTheDocument();
  });
});

describe("EmailTimelineCard expanded", () => {
  it("enables the body query once expanded", async () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /expand email/i }));

    expect(useQuery).toHaveBeenLastCalledWith(
      { messageId: "m1", allowRemote: false },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("renders the body once it arrives", async () => {
    useQuery.mockReturnValue({
      data: { messageId: "m1", accountId: "a1", ownerEmail: "me@example.com" },
      isLoading: false,
      isError: false,
    });
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /expand email/i }));

    expect(screen.getByTestId("reader-message-card")).toBeInTheDocument();
  });

  it("shows a retry affordance rather than an empty body when the fetch fails", async () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /expand email/i }));

    expect(screen.getByText(/Couldn't load this email/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("reader-message-card")).not.toBeInTheDocument();
  });

  it("collapses again and stops rendering the body", async () => {
    useQuery.mockReturnValue({
      data: { messageId: "m1", accountId: "a1", ownerEmail: "me@example.com" },
      isLoading: false,
      isError: false,
    });
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /expand email/i }));
    await userEvent.click(screen.getByRole("button", { name: /collapse email/i }));

    expect(screen.queryByTestId("reader-message-card")).not.toBeInTheDocument();
  });
});

describe("EmailTimelineCard compose modes", () => {
  beforeEach(() => {
    useQuery.mockReturnValue({
      data: { messageId: "m1", accountId: "a1", ownerEmail: "me@example.com" },
      isLoading: false,
      isError: false,
    });
  });

  it("opens the composer in reply mode from the Reply button", async () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Reply" }));

    expect(screen.getByTestId("reader-reply")).toHaveTextContent("reply");
    expect(readerActionsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialMode: "reply" }),
    );
  });

  it("opens the composer in reply-all mode from the menu", async () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reply all" }));

    expect(screen.getByTestId("reader-reply")).toHaveTextContent("replyAll");
    expect(readerActionsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialMode: "replyAll" }),
    );
  });

  it("opens the composer in forward mode from the menu", async () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Forward" }));

    expect(screen.getByTestId("reader-reply")).toHaveTextContent("forward");
    expect(readerActionsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialMode: "forward" }),
    );
  });

  it("re-seeds the composer when a second mode is picked while it is open", async () => {
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Forward" }));

    expect(screen.getByTestId("reader-reply")).toHaveTextContent("forward");
  });
});

describe("EmailTimelineCard actions", () => {
  it("hides reply for a message whose mailbox the actor does not own", () => {
    render(
      <EmailTimelineCard
        message={{ ...message, canCompose: false }}
        scope={dealScope}
        onUnlinked={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /^reply$/i })).not.toBeInTheDocument();
  });

  it("clears the deal link and reports success on unlink", async () => {
    linkThread.mockResolvedValue({ ok: true, value: { threadId: "t1" } });
    const onUnlinked = vi.fn();
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={onUnlinked} />);

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Unlink from deal" }));
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() => {
      expect(linkThread).toHaveBeenCalledWith("csrf", { threadId: "t1", dealId: null });
    });
    expect(onUnlinked).toHaveBeenCalledTimes(1);
  });

  it("clears the person link when the card is on a person timeline", async () => {
    linkThread.mockResolvedValue({ ok: true, value: { threadId: "t1" } });
    render(
      <EmailTimelineCard
        message={message}
        scope={{ kind: "person", personId: "p1" }}
        onUnlinked={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Unlink from person" }));
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() => {
      expect(linkThread).toHaveBeenCalledWith("csrf", { threadId: "t1", personId: null });
    });
  });

  it("does not call onUnlinked when the unlink fails", async () => {
    linkThread.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const onUnlinked = vi.fn();
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={onUnlinked} />);

    await userEvent.click(screen.getByRole("button", { name: /more email actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Unlink from deal" }));
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() => expect(linkThread).toHaveBeenCalled());
    expect(onUnlinked).not.toHaveBeenCalled();
  });
});

describe("EmailTimelineCard reply invalidation", () => {
  it("refreshes both record timelines after a reply, not just the host record", async () => {
    useQuery.mockReturnValue({
      data: { messageId: "m1", accountId: "a1", ownerEmail: "me@example.com" },
      isLoading: false,
      isError: false,
    });
    const onUnlinked = vi.fn();
    render(<EmailTimelineCard message={message} scope={dealScope} onUnlinked={onUnlinked} />);

    await userEvent.click(screen.getByRole("button", { name: /expand email/i }));
    await userEvent.click(screen.getByRole("button", { name: /^reply$/i }));
    await userEvent.click(screen.getByTestId("reader-sent"));

    // A thread can be linked to a deal AND a person: replying from one record must not leave the
    // other serving a cached list without the reply.
    expect(invalidateDeal).toHaveBeenCalled();
    expect(invalidateContact).toHaveBeenCalled();
  });
});
