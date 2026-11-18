// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
            list: { invalidate: vi.fn() },
            unreadCount: { invalidate: vi.fn() },
          },
          folders: { sent: { invalidate: vi.fn() }, archive: { invalidate: vi.fn() } },
          search: { invalidate: vi.fn() },
        },
      }),
    },
  };
});

import { ThreadList } from "./ThreadList";

afterEach(() => cleanup());

describe("non-Inbox folder toolbar", () => {
  it("renders a Refresh control in the Sent folder", () => {
    render(<ThreadList folder="sent" />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("renders a Refresh control in the Archive folder", () => {
    render(<ThreadList folder="archive" />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
