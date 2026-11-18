// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const inboxListQuery = vi.fn();
const emptyFeed = {
  data: { pages: [{ threads: [], nextCursor: null }] },
  hasNextPage: false,
  isFetchingNextPage: false,
  isPending: false,
  isError: false,
  fetchNextPage: vi.fn(),
};
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: {
      inbox: { list: { useInfiniteQuery: () => inboxListQuery() } },
      folders: {
        sent: { useInfiniteQuery: () => emptyFeed },
        archive: { useInfiniteQuery: () => emptyFeed },
      },
    },
    useUtils: () => ({
      email: {
        inbox: { list: { invalidate: vi.fn() }, unreadCount: { invalidate: vi.fn() } },
        folders: { archive: { invalidate: vi.fn() }, sent: { invalidate: vi.fn() } },
        search: { invalidate: vi.fn() },
      },
    }),
  },
}));

import { EMAIL_SYNC_STRINGS } from "@/app/(app)/settings/email-sync/strings";
import { STRINGS } from "@/constants/strings";
import { ThreadList } from "./ThreadList";

afterEach(cleanup);
beforeEach(() => {
  inboxListQuery.mockReset();
  inboxListQuery.mockReturnValue(emptyFeed);
});

describe("ThreadList inbox zero", () => {
  it("celebrates an emptied inbox of a connected mailbox", () => {
    render(<ThreadList folder="inbox" mailboxConnected />);
    expect(screen.getByText(STRINGS.inbox.inboxZeroTitle)).toBeInTheDocument();
    expect(screen.getByText(STRINGS.inbox.inboxZeroBody)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.noThreads)).toBeNull();
  });

  it("keeps the plain no-threads line when no mailbox is connected", () => {
    render(<ThreadList folder="inbox" mailboxConnected={false} />);
    expect(screen.getByText(STRINGS.inbox.noThreads)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.inboxZeroTitle)).toBeNull();
  });

  it("keeps the plain no-threads line for an empty search", () => {
    render(<ThreadList folder="inbox" mailboxConnected threads={[]} />);
    expect(screen.getByText(STRINGS.inbox.noThreads)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.inboxZeroTitle)).toBeNull();
  });

  it("does not celebrate when the inbox feed failed", () => {
    inboxListQuery.mockReturnValue({ ...emptyFeed, data: undefined, isError: true });
    render(<ThreadList folder="inbox" mailboxConnected />);
    expect(screen.queryByText(STRINGS.inbox.inboxZeroTitle)).toBeNull();
  });

  it("shows the syncing state, not inbox zero, while a fresh mailbox's first sync runs", () => {
    render(<ThreadList folder="inbox" mailboxConnected syncPhase="syncing" />);
    expect(screen.getByText(STRINGS.inbox.inboxSyncingTitle)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.inboxZeroTitle)).toBeNull();
    expect(screen.queryByText(STRINGS.inbox.noThreads)).toBeNull();
  });

  it("says the mailbox is connected and waiting for mail when it has never held a thread", () => {
    render(<ThreadList folder="inbox" mailboxConnected syncPhase="awaitingMail" />);
    expect(screen.getByText(STRINGS.inbox.inboxAwaitingMailTitle)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.inboxZeroTitle)).toBeNull();
  });

  it("shows the app's not-syncing copy, not the connected state, when the first sync failed", () => {
    render(<ThreadList folder="inbox" mailboxConnected syncPhase="failed" />);
    expect(screen.getByText(EMAIL_SYNC_STRINGS.statusStalled)).toBeInTheDocument();
    expect(screen.getByText(EMAIL_SYNC_STRINGS.stalledHint)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.inboxAwaitingMailTitle)).toBeNull();
  });
});
