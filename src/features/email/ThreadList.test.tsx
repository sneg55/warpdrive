// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const archiveMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
const unarchiveMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: (...a: unknown[]) => archiveMock(...(a as [])),
  unarchiveThreadAction: (...a: unknown[]) => unarchiveMock(...(a as [])),
}));

type ReadActionResult =
  | { ok: true; value: { threadId: string } }
  | { ok: false; error: { id: string } };
const markReadMock = vi.fn<
  (csrfToken: string, input: { threadId: string }) => Promise<ReadActionResult>
>(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
const markUnreadMock = vi.fn<
  (csrfToken: string, input: { threadId: string }) => Promise<ReadActionResult>
>(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
vi.mock("./readActions", () => ({
  markThreadReadAction: (...a: unknown[]) => markReadMock(...(a as [string, { threadId: string }])),
  markThreadUnreadAction: (...a: unknown[]) =>
    markUnreadMock(...(a as [string, { threadId: string }])),
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const inboxRow = {
  id: "t1",
  subject: "Renewal",
  lastMessageAt: null,
  personId: null,
  dealId: null,
  visibility: "private",
  unread: true,
  followUpStatus: null,
  labels: [],
  isOwner: false,
  senderEmail: null,
  senderName: null,
  snippet: null,
  hasAttachment: false,
};
const secondRow = {
  id: "t2",
  subject: "Follow up",
  lastMessageAt: null,
  personId: null,
  dealId: null,
  visibility: "private",
  unread: false,
  followUpStatus: null,
  labels: [],
  isOwner: false,
  senderEmail: null,
  senderName: null,
  snippet: null,
  hasAttachment: false,
};

// ThreadList pages the inbox via useInfiniteQuery; the mock mirrors its page shape.
const inboxPages = { pages: [{ threads: [inboxRow], nextCursor: null }] };
const inboxListQuery = vi.fn(() => ({
  data: inboxPages,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}));
const invalidateInboxList = vi.fn();
const invalidateFoldersArchive = vi.fn();
const invalidateUnreadCount = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      inbox: { list: { useInfiniteQuery: (...a: unknown[]) => inboxListQuery(...(a as [])) } },
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
        inbox: {
          list: { invalidate: invalidateInboxList },
          unreadCount: { invalidate: invalidateUnreadCount },
        },
        folders: { archive: { invalidate: invalidateFoldersArchive } },
      },
    }),
  },
}));

import { ThreadList } from "./ThreadList";

afterEach(() => {
  cleanup();
  push.mockReset();
  archiveMock.mockReset();
  archiveMock.mockImplementation(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
  unarchiveMock.mockReset();
  markReadMock.mockReset();
  markReadMock.mockImplementation(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
  markUnreadMock.mockReset();
  invalidateInboxList.mockReset();
  invalidateFoldersArchive.mockReset();
  invalidateUnreadCount.mockReset();
  inboxListQuery.mockReset();
  inboxListQuery.mockReturnValue({
    data: { pages: [{ threads: [inboxRow], nextCursor: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
});

describe("ThreadList", () => {
  it("navigates via selectHref when a thread row is clicked (inbox)", () => {
    render(<ThreadList folder="inbox" selectHref={(id) => `/inbox?thread=${id}`} />);
    fireEvent.click(screen.getByText("Renewal"));
    expect(push).toHaveBeenCalledWith("/inbox?thread=t1");
  });

  it("shows an Archive affordance for inbox rows and no filter chips off-inbox", () => {
    const { rerender } = render(<ThreadList folder="inbox" />);
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All/ })).toBeInTheDocument();
    rerender(<ThreadList folder="sent" />);
    expect(screen.queryByRole("button", { name: /All/ })).toBeNull();
  });

  it("bolds the subject of an unread row", () => {
    render(<ThreadList folder="inbox" />);
    const subject = screen.getByText("Renewal");
    expect(subject).toHaveClass("font-semibold");
  });

  // Regression (codex review): the Has-attachment / Unread-only quick-filters only make sense on
  // the inbox feed (the only folder that projects those fields and shows the filter row). An active
  // filter must not carry over when the folder prop switches to Sent/Archive, whose rows default
  // both fields to false and would otherwise all be hidden.
  it("does not apply inbox quick-filters after switching to a non-inbox folder", () => {
    const readRow = { ...inboxRow, id: "t9", subject: "Archived read", unread: false };
    const { rerender } = render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByLabelText("Unread only"));
    rerender(<ThreadList folder="archive" threads={[readRow]} />);
    expect(screen.getByText("Archived read")).toBeInTheDocument();
  });

  it("selecting a row reveals the bulk action bar with a count", () => {
    render(<ThreadList folder="inbox" />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("selecting all visible threads checks the header checkbox", () => {
    inboxListQuery.mockReturnValue({
      data: { pages: [{ threads: [inboxRow, secondRow], nextCursor: null }] },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all threads" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all threads" })).toBeChecked();
  });

  it("clicking a row checkbox does not also navigate to the thread", () => {
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("bulk mark-read calls markThreadReadAction for the selected thread, then clears selection", async () => {
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));

    const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
    fireEvent.click(within(bulkBar).getByRole("button", { name: "Mark read" }));

    await vi.waitFor(() => expect(markReadMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
    await vi.waitFor(() => expect(invalidateUnreadCount).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it("bulk mark-unread calls markThreadUnreadAction for the selected thread", async () => {
    markUnreadMock.mockResolvedValue({ ok: true, value: { threadId: "t1" } });
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));

    const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
    fireEvent.click(within(bulkBar).getByRole("button", { name: "Mark unread" }));

    await vi.waitFor(() => expect(markUnreadMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
  });

  it("bulk-archives the selected thread and invalidates the inbox + archive queries", async () => {
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));

    const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
    fireEvent.click(within(bulkBar).getByRole("button", { name: "Archive" }));

    await vi.waitFor(() => expect(archiveMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
    await vi.waitFor(() => expect(invalidateInboxList).toHaveBeenCalled());
    await vi.waitFor(() => expect(invalidateFoldersArchive).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it("hides selection chrome entirely in the linked folder", () => {
    render(<ThreadList folder="linked" threads={[inboxRow]} />);
    expect(screen.queryByRole("checkbox", { name: "Select all threads" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Select Renewal" })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).toBeNull();
  });

  it("hides the bulk archive button but keeps mark read/unread for the sent folder", () => {
    render(<ThreadList folder="sent" threads={[inboxRow]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));

    const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(within(bulkBar).queryByRole("button", { name: /archive/i })).toBeNull();
    expect(within(bulkBar).getByRole("button", { name: "Mark read" })).toBeInTheDocument();
    expect(within(bulkBar).getByRole("button", { name: "Mark unread" })).toBeInTheDocument();
  });

  it("disables the bulk action buttons while a bulk action is in flight", () => {
    let resolveMarkRead: (value: ReadActionResult) => void = () => {};
    markReadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMarkRead = resolve;
        }),
    );
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Renewal" }));

    const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
    const markReadButton = within(bulkBar).getByRole("button", { name: "Mark read" });
    fireEvent.click(markReadButton);

    expect(markReadButton).toBeDisabled();
    expect(within(bulkBar).getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(within(bulkBar).getByRole("button", { name: "Mark unread" })).toBeDisabled();

    resolveMarkRead({ ok: true, value: { threadId: "t1" } });
  });

  it("keeps the failed thread selected and surfaces an error on a partial bulk mark-read failure", async () => {
    inboxListQuery.mockReturnValue({
      data: { pages: [{ threads: [inboxRow, secondRow], nextCursor: null }] },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    markReadMock.mockImplementation((_csrf: string, input: { threadId: string }) =>
      Promise.resolve(
        input.threadId === "t1"
          ? { ok: true, value: { threadId: "t1" } }
          : { ok: false, error: { id: "E_GMAIL_019" } },
      ),
    );
    render(<ThreadList folder="inbox" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all threads" }));

    const bulkBar = screen.getByRole("toolbar", { name: "Bulk actions" });
    fireEvent.click(within(bulkBar).getByRole("button", { name: "Mark read" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't|could not|failed/i);
    await vi.waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select Follow up" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Renewal" })).not.toBeChecked();
  });
});
