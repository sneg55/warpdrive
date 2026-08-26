// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const inboxListQuery = vi.fn();
const emptyFolder = {
  data: { pages: [{ threads: [], nextCursor: null }] },
  hasNextPage: false,
  isFetchingNextPage: false,
  isPending: false,
  fetchNextPage: vi.fn(),
};
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: {
      inbox: { list: { useInfiniteQuery: () => inboxListQuery() } },
      folders: {
        sent: { useInfiniteQuery: () => emptyFolder },
        archive: { useInfiniteQuery: () => emptyFolder },
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

import { STRINGS } from "@/constants/strings";
import { ThreadList } from "./ThreadList";

afterEach(cleanup);
beforeEach(() => {
  inboxListQuery.mockReset();
});

// A pending feed must never be painted as an empty mailbox: "No threads found." and a "0
// conversations" count are both assertions the query has not yet made.
describe("ThreadList loading state", () => {
  it("renders a skeleton instead of the no-threads copy while the feed is pending", () => {
    inboxListQuery.mockReturnValue({
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      isPending: true,
      fetchNextPage: vi.fn(),
    });
    render(<ThreadList folder="inbox" />);
    expect(screen.getByRole("status", { name: /loading conversations/i })).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.noThreads)).toBeNull();
    expect(screen.queryByText(/0 conversations/)).toBeNull();
  });

  it("renders the no-threads copy once the feed resolves empty", () => {
    inboxListQuery.mockReturnValue({
      data: { pages: [{ threads: [], nextCursor: null }] },
      hasNextPage: false,
      isFetchingNextPage: false,
      isPending: false,
      fetchNextPage: vi.fn(),
    });
    render(<ThreadList folder="inbox" />);
    expect(screen.getByText(STRINGS.inbox.noThreads)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading conversations/i })).toBeNull();
    expect(screen.getByText(/0 conversations/)).toBeInTheDocument();
  });

  it("shows the skeleton when the caller supplies threads that are still loading", () => {
    inboxListQuery.mockReturnValue(emptyFolder);
    render(<ThreadList folder="inbox" threads={[]} threadsPending />);
    expect(screen.getByRole("status", { name: /loading conversations/i })).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.inbox.noThreads)).toBeNull();
  });
});
