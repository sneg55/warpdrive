// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ThreadList is exercised on its own; here we only assert the tab wires forContact to it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

interface ForContactState {
  data: unknown[] | undefined;
  isLoading: boolean;
  isError: boolean;
}
const forContactData = vi.fn<() => ForContactState>();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: { list: { useQuery: () => ({ data: [] }) } },
    email: {
      forContact: { useQuery: () => forContactData() },
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
      email: {
        inbox: { list: { invalidate: vi.fn() } },
        folders: { archive: { invalidate: vi.fn() } },
      },
    }),
  },
}));

import { OrgEmailPanel, PersonEmailTab } from "./PersonEmailTab";

afterEach(() => {
  cleanup();
  forContactData.mockReset();
});

describe("PersonEmailTab", () => {
  it("renders threads from email.forContact through ThreadList", () => {
    forContactData.mockReturnValue({
      data: [
        {
          id: "t1",
          subject: "Intro call",
          lastMessageAt: null,
          personId: "pe1",
          dealId: null,
          visibility: "shared",
          labels: [],
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<PersonEmailTab personId="pe1" />);
    expect(screen.getByText("Intro call")).toBeInTheDocument();
    expect(screen.queryByText(/no emails/i)).not.toBeInTheDocument();
  });

  it("shows a genuine empty state only when loaded with zero linked threads", () => {
    forContactData.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PersonEmailTab personId="pe1" />);
    expect(screen.getByText(/no emails/i)).toBeInTheDocument();
    // Never the stale Phase 4 placeholder.
    expect(screen.queryByText(/phase 4/i)).not.toBeInTheDocument();
  });

  it("does not show the empty state while the query is loading", () => {
    forContactData.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<PersonEmailTab personId="pe1" />);
    // Loading must never read as "no emails" (the collapsed-state bug).
    expect(screen.queryByText(/no emails/i)).not.toBeInTheDocument();
  });

  it("shows an error line (not the empty state) when the query errors", () => {
    forContactData.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<PersonEmailTab personId="pe1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load|could not load|failed/i);
    expect(screen.queryByText(/no emails/i)).not.toBeInTheDocument();
  });
});

describe("OrgEmailPanel", () => {
  it("shows an honest not-applicable state, not the Phase 4 placeholder", () => {
    render(<OrgEmailPanel />);
    expect(screen.queryByText(/phase 4/i)).not.toBeInTheDocument();
    expect(screen.getByText(/tracked on people/i)).toBeInTheDocument();
  });
});
