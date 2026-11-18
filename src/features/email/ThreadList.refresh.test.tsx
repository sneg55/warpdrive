// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(invalidateSearch).toHaveBeenCalled();
  });

  it("shows Refresh as busy and ignores repeat clicks until the re-read settles", async () => {
    let settle: () => void = () => {};
    invalidateInboxList.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const busy = screen.getByRole("button", { name: "Refreshing…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    fireEvent.click(busy);
    expect(invalidateInboxList).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Refresh" })).not.toBeDisabled();
  });

  it("also awaits the caller's extra refresh, so the sync state re-reads too", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<ThreadList folder="inbox" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
