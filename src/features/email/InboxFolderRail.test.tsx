// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const unreadCount = vi.fn<() => number | undefined>(() => 0);
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      inbox: { unreadCount: { useQuery: () => ({ data: unreadCount() }) } },
    },
  },
}));

import { InboxFolderRail } from "./InboxFolderRail";

afterEach(() => {
  cleanup();
  unreadCount.mockReturnValue(0);
});

it("renders every folder as a link carrying ?folder= and marks the active one", () => {
  render(<InboxFolderRail activeFolder="sent" newEmailEnabled={false} onNewEmail={() => {}} />);
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute(
    "href",
    "/inbox?folder=inbox",
  );
  const sent = screen.getByRole("link", { name: /Sent/ });
  expect(sent).toHaveAttribute("href", "/inbox?folder=sent");
  expect(sent).toHaveAttribute("aria-current", "page");
  // no more "(soon)" suffixes now that folders are backed
  expect(screen.queryByText(/soon/)).toBeNull();
});

it("New email is disabled without a mailbox and calls onNewEmail when enabled", () => {
  const onNewEmail = vi.fn();
  const { rerender } = render(
    <InboxFolderRail activeFolder="inbox" newEmailEnabled={false} onNewEmail={onNewEmail} />,
  );
  expect(screen.getByRole("button", { name: /New email/ })).toBeDisabled();
  rerender(<InboxFolderRail activeFolder="inbox" newEmailEnabled={true} onNewEmail={onNewEmail} />);
  screen.getByRole("button", { name: /New email/ }).click();
  expect(onNewEmail).toHaveBeenCalledOnce();
});

it("shows an unread count badge on Inbox when the count is greater than zero", () => {
  unreadCount.mockReturnValue(3);
  render(<InboxFolderRail activeFolder="inbox" newEmailEnabled={false} onNewEmail={() => {}} />);
  expect(screen.getByText("3")).toBeInTheDocument();
});

it("shows no badge when the unread count is zero", () => {
  unreadCount.mockReturnValue(0);
  render(<InboxFolderRail activeFolder="inbox" newEmailEnabled={false} onNewEmail={() => {}} />);
  expect(screen.queryByText("0")).toBeNull();
});
