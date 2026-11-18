// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INBOX_SYNC_FAILED_POLL_MS } from "@/constants/inbox";
import type { InboxFilter } from "@/features/email/emailReads";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/email/useInboxRealtime", () => ({ useInboxRealtime: () => {} }));
vi.mock("@/features/email/DraftsList", () => ({ DraftsList: () => null }));
vi.mock("@/features/email/OutboxList", () => ({ OutboxList: () => null }));

vi.mock("@/features/email/InboxSearchBar", () => ({
  InboxSearchBar: ({ onQuery }: { onQuery: (q: string) => void }) => (
    <button type="button" onClick={() => onQuery("budget")}>
      run-search
    </button>
  ),
}));

const threadListQuickFilters: (InboxFilter | undefined)[] = [];
const threadListConnected: (boolean | undefined)[] = [];
const threadListPhases: (string | undefined)[] = [];
let threadListRefresh: (() => Promise<unknown>) | undefined;
vi.mock("@/features/email/ThreadList", () => ({
  ThreadList: ({
    quickFilter,
    onQuickFilterChange,
    mailboxConnected,
    syncPhase,
    onRefresh,
  }: {
    quickFilter?: InboxFilter;
    onQuickFilterChange?: (next: InboxFilter) => void;
    mailboxConnected?: boolean;
    syncPhase?: string;
    onRefresh?: () => Promise<unknown>;
  }) => {
    threadListQuickFilters.push(quickFilter);
    threadListConnected.push(mailboxConnected);
    threadListPhases.push(syncPhase);
    threadListRefresh = onRefresh;
    return (
      <button type="button" onClick={() => onQuickFilterChange?.("shared")}>
        set-shared
      </button>
    );
  },
}));

const searchCalls: { q: string; filter: InboxFilter }[] = [];
type PollFn = (query: { state: { data: string | undefined } }) => number | false;
const phaseCalls: { input: unknown; opts: { initialData?: string; refetchInterval?: PollFn } }[] =
  [];
let phaseData: string | undefined;
const phaseRefetch = vi.fn(() => Promise.resolve());
const invalidateInboxList = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { inbox: { list: { invalidate: invalidateInboxList } } } }),
    email: {
      mailboxSyncPhase: {
        useQuery: (input: unknown, opts: { initialData?: string; refetchInterval?: PollFn }) => {
          phaseCalls.push({ input, opts });
          return { data: phaseData ?? opts.initialData, refetch: phaseRefetch };
        },
      },
      search: {
        useQuery: (input: { q: string; filter: InboxFilter }) => {
          searchCalls.push(input);
          return { data: [] };
        },
      },
    },
  },
}));

import { InboxListClient } from "./InboxListClient";

afterEach(() => {
  cleanup();
  searchCalls.length = 0;
  threadListQuickFilters.length = 0;
  threadListConnected.length = 0;
  threadListPhases.length = 0;
  phaseCalls.length = 0;
  phaseData = undefined;
  phaseRefetch.mockClear();
  invalidateInboxList.mockClear();
});

describe("InboxListClient search + quick filter", () => {
  it("feeds the active quick-filter into the search query and re-issues when it changes", () => {
    render(
      <InboxListClient
        selfActorId="u1"
        folder="inbox"
        mailboxConnected={false}
        initialSyncPhase="ready"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "run-search" }));
    expect(searchCalls.at(-1)).toEqual({ q: "budget", filter: "all" });

    fireEvent.click(screen.getByRole("button", { name: "set-shared" }));
    expect(searchCalls.at(-1)).toEqual({ q: "budget", filter: "shared" });
  });

  it("passes the active quick-filter down to ThreadList", () => {
    render(
      <InboxListClient
        selfActorId="u1"
        folder="inbox"
        mailboxConnected={false}
        initialSyncPhase="ready"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "set-shared" }));
    expect(threadListQuickFilters.at(-1)).toBe("shared");
  });

  it("tells ThreadList whether the viewed mailbox is connected", () => {
    render(
      <InboxListClient selfActorId="u1" folder="inbox" mailboxConnected initialSyncPhase="ready" />,
    );
    expect(threadListConnected.at(-1)).toBe(true);
  });
});

describe("InboxListClient mailbox sync phase", () => {
  it("seeds the phase from the server and hands it to ThreadList for the viewed mailbox", () => {
    render(
      <InboxListClient
        selfActorId="u1"
        folder="inbox"
        mailbox="m1"
        mailboxConnected
        initialSyncPhase="syncing"
      />,
    );
    expect(phaseCalls.at(-1)?.input).toEqual({ mailbox: "m1" });
    expect(phaseCalls.at(-1)?.opts.initialData).toBe("syncing");
    expect(threadListPhases.at(-1)).toBe("syncing");
  });

  it("polls while the mailbox is syncing or its first sync failed, and stops once settled", () => {
    render(
      <InboxListClient
        selfActorId="u1"
        folder="inbox"
        mailboxConnected
        initialSyncPhase="syncing"
      />,
    );
    const poll = phaseCalls.at(-1)?.opts.refetchInterval;
    expect(poll?.({ state: { data: "syncing" } })).toBeGreaterThan(0);
    expect(poll?.({ state: { data: "ready" } })).toBe(false);
    expect(poll?.({ state: { data: "awaitingMail" } })).toBe(false);
    expect(poll?.({ state: { data: "failed" } })).toBe(INBOX_SYNC_FAILED_POLL_MS);
  });

  it("re-reads the phase when ThreadList's Refresh runs", async () => {
    render(
      <InboxListClient selfActorId="u1" folder="inbox" mailboxConnected initialSyncPhase="ready" />,
    );
    await threadListRefresh?.();
    expect(phaseRefetch).toHaveBeenCalledTimes(1);
  });

  it("re-reads the thread list once a sync finishes, so imported threads appear", () => {
    const { rerender } = render(
      <InboxListClient
        selfActorId="u1"
        folder="inbox"
        mailboxConnected
        initialSyncPhase="syncing"
      />,
    );
    expect(invalidateInboxList).not.toHaveBeenCalled();
    phaseData = "ready";
    rerender(
      <InboxListClient
        selfActorId="u1"
        folder="inbox"
        mailboxConnected
        initialSyncPhase="syncing"
      />,
    );
    expect(invalidateInboxList).toHaveBeenCalledTimes(1);
  });
});
