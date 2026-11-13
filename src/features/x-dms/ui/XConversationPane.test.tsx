// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { XConversationDetail } from "../reads";

type MutationOpts = { onSuccess?: () => void; onError?: (e: { message: string }) => void };

const mutation = vi.hoisted(() => (spy: (input: unknown) => unknown) => (opts: MutationOpts) => ({
  mutate: (input: unknown) => {
    const outcome = spy(input) as { fail?: string } | undefined;
    if (outcome?.fail !== undefined) opts.onError?.({ message: outcome.fail });
    else opts.onSuccess?.();
  },
  isPending: false,
}));

const state = vi.hoisted(() => ({
  detail: undefined as XConversationDetail | undefined,
  markRead: vi.fn(),
  markUnread: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  push: vi.fn(),
  reportError: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => state.reportError,
}));
vi.mock("./XReplyComposer", () => ({
  XReplyComposer: () => <div data-testid="composer" />,
}));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      xDms: {
        list: { invalidate: state.invalidate },
        conversation: { invalidate: state.invalidate },
        unreadCount: { invalidate: state.invalidate },
        accounts: { invalidate: state.invalidate },
      },
    }),
    xDms: {
      conversation: { useQuery: () => ({ data: state.detail }) },
      markRead: { useMutation: mutation(state.markRead) },
      markUnread: { useMutation: mutation(state.markUnread) },
      archive: { useMutation: mutation(state.archive) },
      unarchive: { useMutation: mutation(state.unarchive) },
    },
  },
}));

import { XConversationPane } from "./XConversationPane";

const conversation: XConversationDetail["conversation"] = {
  id: "c1",
  accountId: "a1",
  participantUsername: "ada",
  participantName: "Ada Lovelace",
  participantAvatarUrl: null,
  encrypted: false,
  snippet: "Hi",
  lastMessageAt: "2026-11-13T10:00:00.000Z",
  unread: true,
  replyStatus: null,
  xUnread: false,
};

const messages: XConversationDetail["messages"] = [
  {
    id: "m1",
    direction: "inbound",
    text: "Stored before the flip",
    hasMedia: false,
    sentAt: "2026-11-13T09:00:00.000Z",
    sentByFirstName: null,
    unreadable: false,
  },
  {
    id: "m2",
    direction: "outbound",
    text: "Our answer",
    hasMedia: true,
    sentAt: "2026-11-13T09:30:00.000Z",
    sentByFirstName: "Sam",
    unreadable: false,
  },
];

beforeEach(() => {
  state.detail = { conversation, messages };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("encrypted pane hides unreadable rows and keeps readable ones above the panel", () => {
  const unreadable = { text: "", hasMedia: false, unreadable: true, sentByFirstName: null };
  const readable = messages[0];
  if (readable === undefined) throw new Error("fixture missing");
  state.detail = {
    conversation: { ...conversation, encrypted: true },
    messages: [
      readable,
      { ...unreadable, id: "u1", direction: "inbound", sentAt: "2026-11-13T09:40:00.000Z" },
      { ...unreadable, id: "u2", direction: "outbound", sentAt: "2026-11-13T09:50:00.000Z" },
    ],
  };
  render(<XConversationPane conversationId="c1" accountId="a1" view="inbox" />);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("Stored before the flip")).toBeInTheDocument();
  expect(screen.queryByText("Message could not be read")).toBeNull();
  expect(screen.getByText("End-to-end encrypted")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Open in X" })).toHaveLength(1);
});

it("encrypted pane shows the panel, stored messages and no composer", () => {
  state.detail = { conversation: { ...conversation, encrypted: true, xUnread: true }, messages };
  render(<XConversationPane conversationId="c1" accountId="a1" view="inbox" />);
  expect(screen.getByText("End-to-end encrypted")).toBeInTheDocument();
  expect(
    screen.getByText(
      "This conversation is end-to-end encrypted, so it can only be read and answered in the X app.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open in X" })).toHaveAttribute(
    "href",
    "https://x.com/messages",
  );
  expect(screen.getByText("Unread in X")).toBeInTheDocument();
  expect(screen.getByText("Stored before the flip")).toBeInTheDocument();
  expect(screen.queryByTestId("composer")).toBeNull();
});

it("shows messages with the sender's first name and the composer for a readable conversation", () => {
  render(<XConversationPane conversationId="c1" accountId="a1" view="inbox" />);
  expect(screen.getByText("Our answer")).toBeInTheDocument();
  expect(screen.getByText("[attachment]")).toBeInTheDocument();
  expect(screen.getByText(/Sam/)).toBeInTheDocument();
  expect(screen.getByTestId("composer")).toBeInTheDocument();
  expect(screen.queryByText("End-to-end encrypted")).toBeNull();
  expect(screen.queryByText("Unread in X")).toBeNull();
});

it("shows each unreadable message as a bubble on its side with a link to X", () => {
  const unreadable = { text: "", hasMedia: false, unreadable: true, sentByFirstName: null };
  state.detail = {
    conversation: { ...conversation, snippet: null },
    messages: [
      { ...unreadable, id: "u1", direction: "inbound", sentAt: "2026-11-13T09:00:00.000Z" },
      { ...unreadable, id: "u2", direction: "outbound", sentAt: "2026-11-13T09:10:00.000Z" },
    ],
  };
  render(<XConversationPane conversationId="c1" accountId="a1" view="inbox" />);
  const bubbles = screen.getAllByText("Message could not be read").map((el) => el.closest("li"));
  expect(bubbles.map((li) => li?.className.includes("self-end"))).toEqual([false, true]);
  const links = screen.getAllByRole("link", { name: "Open in X" });
  expect(links.map((a) => a.getAttribute("href"))).toEqual([
    "https://x.com/messages",
    "https://x.com/messages",
  ]);
  expect(screen.getByTestId("composer")).toBeInTheDocument();
});

it("marks the conversation read once when it opens", () => {
  const { rerender } = render(
    <XConversationPane conversationId="c1" accountId="a1" view="inbox" />,
  );
  rerender(<XConversationPane conversationId="c1" accountId="a1" view="inbox" />);
  expect(state.markRead).toHaveBeenCalledTimes(1);
  expect(state.markRead).toHaveBeenCalledWith({ conversationId: "c1" });
});

it("archives and returns to the list, and reports a failed mark unread with its id", async () => {
  const user = userEvent.setup();
  render(<XConversationPane conversationId="c1" accountId="a1" view="inbox" />);
  await user.click(screen.getByRole("button", { name: "Archive" }));
  expect(state.archive).toHaveBeenCalledWith({ conversationId: "c1" });
  expect(state.push).toHaveBeenCalledWith("/inbox/x/a1");
  state.markUnread.mockReturnValueOnce({ fail: "E_X_007" });
  await user.click(screen.getByRole("button", { name: "Mark as unread" }));
  expect(state.reportError).toHaveBeenCalledWith("E_X_007");
});

it("offers Unarchive in the archived view", async () => {
  const user = userEvent.setup();
  render(<XConversationPane conversationId="c1" accountId="a1" view="archived" />);
  await user.click(screen.getByRole("button", { name: "Unarchive" }));
  expect(state.unarchive).toHaveBeenCalledWith({ conversationId: "c1" });
  expect(state.push).toHaveBeenCalledWith("/inbox/x/a1?view=archived");
});
