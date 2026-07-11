// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: () => Promise.resolve({ ok: true, value: { threadId: "t1" } }),
  unarchiveThreadAction: () => Promise.resolve({ ok: true, value: { threadId: "t1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
// Stub the reader so the inline-read test does not need the full thread.get query surface.
vi.mock("./ThreadPane", () => ({
  ThreadPane: ({ threadId }: { threadId: string }) => <div>READER:{threadId}</div>,
}));

const forDealData = vi.fn<() => unknown[] | undefined>();
const forDealState = vi.fn<() => { isLoading: boolean; isError: boolean }>(() => ({
  isLoading: false,
  isError: false,
}));
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      forDeal: { useQuery: () => ({ data: forDealData(), ...forDealState() }) },
      inbox: {
        list: {
          useInfiniteQuery: () => ({
            data: undefined,
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          }),
        },
      },
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
      email: { inbox: { list: { invalidate } }, folders: { archive: { invalidate } } },
    }),
  },
}));

import { DealEmailTab } from "./DealEmailTab";

afterEach(() => {
  cleanup();
  forDealData.mockReset();
  forDealState.mockReturnValue({ isLoading: false, isError: false });
});

describe("DealEmailTab", () => {
  it("shows a deal-specific empty state when no threads are linked", () => {
    forDealData.mockReturnValue([]);
    render(<DealEmailTab dealId="d1" />);
    expect(screen.getByText(/no emails linked to this deal/i)).toBeInTheDocument();
  });

  it("does not show the empty state while the query is loading", () => {
    forDealData.mockReturnValue(undefined);
    forDealState.mockReturnValue({ isLoading: true, isError: false });
    render(<DealEmailTab dealId="d1" />);
    expect(screen.queryByText(/no emails linked to this deal/i)).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an error line (not the empty state) when the query errors", () => {
    forDealData.mockReturnValue(undefined);
    forDealState.mockReturnValue({ isLoading: false, isError: true });
    render(<DealEmailTab dealId="d1" />);
    expect(screen.queryByText(/no emails linked to this deal/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/couldn't load|could not load|failed to load|error/i),
    ).toBeInTheDocument();
  });

  it("renders the linked threads through ThreadList when present", () => {
    forDealData.mockReturnValue([
      {
        id: "t1",
        subject: "Renewal",
        lastMessageAt: null,
        personId: null,
        dealId: "d1",
        visibility: "shared",
        labels: [],
      },
    ]);
    render(<DealEmailTab dealId="d1" />);
    expect(screen.getByText("Renewal")).toBeInTheDocument();
    expect(screen.queryByText(/no emails linked to this deal/i)).not.toBeInTheDocument();
  });

  it("reads a selected thread inline (A2) and returns to the list on Back", async () => {
    const user = userEvent.setup();
    forDealData.mockReturnValue([
      {
        id: "t1",
        subject: "Renewal",
        lastMessageAt: null,
        personId: null,
        dealId: "d1",
        visibility: "shared",
        labels: [],
      },
    ]);
    render(<DealEmailTab dealId="d1" />);
    // Opening the thread reads it inline (no navigation): the reader shows, the router is untouched.
    await user.click(screen.getByRole("button", { name: /Renewal/ }));
    expect(screen.getByText("READER:t1")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // Back returns to the thread list.
    await user.click(screen.getByRole("button", { name: /back to emails/i }));
    expect(screen.queryByText("READER:t1")).not.toBeInTheDocument();
    expect(screen.getByText("Renewal")).toBeInTheDocument();
  });
});
