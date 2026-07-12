// @vitest-environment jsdom
// U5 (A1): the inbox toolbar has a manual Refresh control that re-fetches the thread list AND the
// unread count (Pipedrive parity). Kept in its own file so ThreadList.test.tsx stays under the
// 300-line cap. Mirrors that file's trpc mock, narrowed to the two invalidations Refresh drives.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } })),
  unarchiveThreadAction: vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } })),
}));
vi.mock("./readActions", () => ({
  markThreadReadAction: vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } })),
  markThreadUnreadAction: vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const invalidateInboxList = vi.fn();
const invalidateUnreadCount = vi.fn();
const invalidateSearch = vi.fn();
vi.mock("@/lib/trpc-client", () => {
  const emptyInfinite = () => ({
    data: { pages: [{ threads: [], nextCursor: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
  return {
    trpc: {
      email: {
        inbox: { list: { useInfiniteQuery: emptyInfinite } },
        folders: {
          sent: { useInfiniteQuery: emptyInfinite },
          archive: { useInfiniteQuery: emptyInfinite },
        },
      },
      useUtils: () => ({
        email: {
          inbox: {
            list: { invalidate: invalidateInboxList },
            unreadCount: { invalidate: invalidateUnreadCount },
          },
          folders: { sent: { invalidate: vi.fn() }, archive: { invalidate: vi.fn() } },
          search: { invalidate: invalidateSearch },
        },
      }),
    },
  };
});

import { ThreadList } from "./ThreadList";

afterEach(() => {
  cleanup();
  invalidateInboxList.mockReset();
  invalidateUnreadCount.mockReset();
  invalidateSearch.mockReset();
});

describe("ThreadList Refresh", () => {
  it("invalidates the inbox list and the unread count when Refresh is clicked", () => {
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(invalidateInboxList).toHaveBeenCalled();
    expect(invalidateUnreadCount).toHaveBeenCalled();
  });

  it("invalidates in-mail search results on Refresh (search overrides the active folder)", () => {
    // When the search box holds a query, InboxListClient feeds email.search results to the list,
    // so Refresh must invalidate search too or clicking it while viewing results does nothing
    // (codex P2). Search overrides any folder, so refresh invalidates it regardless of tab.
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(invalidateSearch).toHaveBeenCalled();
  });
});
