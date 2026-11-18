// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const archiveMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
const unarchiveMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: (...a: unknown[]) => archiveMock(...(a as [])),
  unarchiveThreadAction: (...a: unknown[]) => unarchiveMock(...(a as [])),
}));
vi.mock("./readActions", () => ({
  markThreadReadAction: vi.fn(),
  markThreadUnreadAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const row = {
  id: "t1",
  subject: "Renewal",
  lastMessageAt: null,
  personId: null,
  dealId: null,
  visibility: "private",
  unread: false,
  followUpStatus: null,
  labels: [],
  isOwner: true,
  senderEmail: null,
  senderName: null,
  snippet: null,
  hasAttachment: false,
};
const feed = () => ({
  data: { pages: [{ threads: [row], nextCursor: null }] },
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
});
const invalidateThreadGet = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: {
      inbox: { list: { useInfiniteQuery: () => feed() } },
      folders: {
        sent: { useInfiniteQuery: () => feed() },
        archive: { useInfiniteQuery: () => feed() },
      },
    },
    useUtils: () => ({
      email: {
        inbox: { list: { invalidate: vi.fn() }, unreadCount: { invalidate: vi.fn() } },
        folders: { archive: { invalidate: vi.fn() }, sent: { invalidate: vi.fn() } },
        search: { invalidate: vi.fn() },
        thread: { get: { invalidate: invalidateThreadGet } },
      },
    }),
  },
}));

import { ThreadList } from "./ThreadList";

afterEach(() => {
  cleanup();
  invalidateThreadGet.mockClear();
});

it("drops the cached reader thread after a row archive, so reopening it shows the new state", async () => {
  render(<ThreadList folder="inbox" />);
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  await vi.waitFor(() => expect(archiveMock).toHaveBeenCalled());
  await vi.waitFor(() => expect(invalidateThreadGet).toHaveBeenCalled());
});

it("drops the cached reader thread after a bulk unarchive", async () => {
  render(<ThreadList folder="archive" />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));
  const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
  fireEvent.click(within(bulkBar).getByRole("button", { name: "Unarchive" }));
  await vi.waitFor(() => expect(unarchiveMock).toHaveBeenCalled());
  await vi.waitFor(() => expect(invalidateThreadGet).toHaveBeenCalled());
});
