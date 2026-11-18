// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: vi.fn(),
  unarchiveThreadAction: vi.fn(),
}));
vi.mock("./readActions", () => ({
  markThreadReadAction: vi.fn(),
  markThreadUnreadAction: vi.fn(),
}));

vi.mock("./ThreadPrivacyToggle", () => ({
  ThreadPrivacyToggle: (props: { onChanged?: () => void }) => (
    <button type="button" data-testid="priv-toggle" onClick={() => props.onChanged?.()}>
      privacy
    </button>
  ),
}));

const invalidateInboxList = vi.fn();
const invalidateFoldersSent = vi.fn();
const invalidateFoldersArchive = vi.fn();
const invalidateSearch = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: {
      inbox: {
        list: {
          useInfiniteQuery: () => ({
            data: { pages: [{ threads: [], nextCursor: null }] },
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          }),
        },
      },
      folders: {
        sent: { useInfiniteQuery: () => ({ data: { pages: [] }, fetchNextPage: vi.fn() }) },
        archive: { useInfiniteQuery: () => ({ data: { pages: [] }, fetchNextPage: vi.fn() }) },
      },
    },
    useUtils: () => ({
      email: {
        inbox: {
          list: { invalidate: invalidateInboxList },
          unreadCount: { invalidate: vi.fn() },
        },
        folders: {
          sent: { invalidate: invalidateFoldersSent },
          archive: { invalidate: invalidateFoldersArchive },
        },
        search: { invalidate: invalidateSearch },
      },
    }),
  },
}));

import { ThreadList } from "./ThreadList";

const ownerRow = {
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

afterEach(() => {
  cleanup();
  invalidateInboxList.mockClear();
  invalidateFoldersSent.mockClear();
  invalidateFoldersArchive.mockClear();
  invalidateSearch.mockClear();
});

describe("ThreadList visibility invalidation", () => {
  it("invalidates the search query (and the feeds) when a row's privacy changes", async () => {
    render(<ThreadList folder="inbox" threads={[ownerRow]} />);
    fireEvent.click(screen.getByTestId("priv-toggle"));
    await waitFor(() => expect(invalidateSearch).toHaveBeenCalled());
    expect(invalidateInboxList).toHaveBeenCalled();
    expect(invalidateFoldersSent).toHaveBeenCalled();
    expect(invalidateFoldersArchive).toHaveBeenCalled();
  });
});
