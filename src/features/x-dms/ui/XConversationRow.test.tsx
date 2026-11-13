// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { XConversationRow as Row } from "../conversationRow";
import { XConversationRow } from "./XConversationRow";

afterEach(cleanup);

const base: Row = {
  id: "c1",
  participantUsername: "ada",
  participantName: "Ada Lovelace",
  participantAvatarUrl: null,
  encrypted: false,
  snippet: "Hello there",
  lastMessageAt: "2026-11-13T10:00:00.000Z",
  unread: false,
  replyStatus: null,
};

it("row shows TeamReplyChip and Encrypted marker", () => {
  render(
    <ul>
      <XConversationRow
        accountId="a1"
        view="inbox"
        conversation={{
          ...base,
          encrypted: true,
          snippet: null,
          replyStatus: { kind: "replied", byName: null },
        }}
      />
    </ul>,
  );
  expect(screen.getByText("Encrypted")).toBeInTheDocument();
  expect(screen.getByText("Replied")).toBeInTheDocument();
  expect(screen.getByText("@ada")).toBeInTheDocument();
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/inbox/x/a1/c1");
});

it("shows the snippet, and [attachment] for a media-only newest message", () => {
  const { rerender } = render(
    <ul>
      <XConversationRow accountId="a1" view="inbox" conversation={base} />
    </ul>,
  );
  expect(screen.getByText("Hello there")).toBeInTheDocument();
  rerender(
    <ul>
      <XConversationRow accountId="a1" view="inbox" conversation={{ ...base, snippet: "" }} />
    </ul>,
  );
  expect(screen.getByText("[attachment]")).toBeInTheDocument();
  expect(screen.queryByText("Encrypted")).toBeNull();
});

it("shows that the message could not be read when a readable row has no snippet", () => {
  render(
    <ul>
      <XConversationRow accountId="a1" view="inbox" conversation={{ ...base, snippet: null }} />
    </ul>,
  );
  expect(screen.getByText("Message could not be read")).toBeInTheDocument();
  expect(screen.queryByText("Encrypted")).toBeNull();
});

it("shows the last activity as a relative time", () => {
  render(
    <ul>
      <XConversationRow
        accountId="a1"
        view="inbox"
        conversation={{
          ...base,
          lastMessageAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        }}
      />
    </ul>,
  );
  expect(screen.getByText("3 hours ago")).toBeInTheDocument();
});

it("links into the archived view and marks unread rows", () => {
  render(
    <ul>
      <XConversationRow accountId="a1" view="archived" conversation={{ ...base, unread: true }} />
    </ul>,
  );
  expect(screen.getByRole("link")).toHaveAttribute("href", "/inbox/x/a1/c1?view=archived");
  expect(screen.getByText("Unread")).toBeInTheDocument();
});
