// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: vi.fn(),
  unarchiveThreadAction: vi.fn(),
}));
vi.mock("./readActions", () => ({
  markThreadReadAction: vi.fn(),
  markThreadUnreadAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

function row(id: string, subject: string) {
  return {
    id,
    subject,
    lastMessageAt: null,
    personId: null,
    dealId: null,
    visibility: "private",
    unread: false,
    followUpStatus: null,
    labels: [],
    senderEmail: null,
    senderName: null,
    snippet: null,
    hasAttachment: false,
  };
}

const fetchNextPage = vi.fn();
const infiniteState = {
  data: { pages: [{ threads: [row("t1", "One")], nextCursor: { lastMessageAt: null, id: "t1" } }] },
  hasNextPage: true,
  isFetchingNextPage: false,
  fetchNextPage,
};

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: {
      inbox: { list: { useInfiniteQuery: () => infiniteState } },
      folders: {
        sent: {
          useInfiniteQuery: () => ({
            data: { pages: [{ threads: [], nextCursor: null }] },
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          }),
        },
        archive: {
          useInfiniteQuery: () => ({
            data: { pages: [{ threads: [], nextCursor: null }] },
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          }),
        },
      },
    },
    useUtils: () => ({
      email: {
        inbox: { list: { invalidate: vi.fn() }, unreadCount: { invalidate: vi.fn() } },
        folders: { archive: { invalidate: vi.fn() } },
      },
    }),
  },
}));

import { ThreadList } from "./ThreadList";

afterEach(() => {
  cleanup();
  fetchNextPage.mockClear();
});

describe("ThreadList paging", () => {
  it("offers Load more while the mailbox has another page", () => {
    render(<ThreadList folder="inbox" />);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("fetches the next page when Load more is pressed", () => {
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("renders every thread accumulated across loaded pages", () => {
    infiniteState.data = {
      pages: [
        { threads: [row("t1", "One")], nextCursor: { lastMessageAt: null, id: "t1" } },
        { threads: [row("t2", "Two")], nextCursor: { lastMessageAt: null, id: "t2" } },
      ],
    };
    render(<ThreadList folder="inbox" />);
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    infiniteState.data = {
      pages: [{ threads: [row("t1", "One")], nextCursor: { lastMessageAt: null, id: "t1" } }],
    };
  });

  it("hides Load more once the mailbox is exhausted", () => {
    infiniteState.hasNextPage = false;
    render(<ThreadList folder="inbox" />);
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
    infiniteState.hasNextPage = true;
  });
});
