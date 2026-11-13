// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

let pathname = "/inbox";
let searchParamsStr = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(searchParamsStr),
}));

const unreadCount = vi.fn<() => number | undefined>(() => 0);
const xAccounts = vi.fn<
  () => { id: string; displayName: string; username: string; unread: number }[]
>(() => []);
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    xDms: { accounts: { useQuery: () => ({ data: xAccounts() }) } },
    email: {
      mailboxes: { useQuery: () => ({ data: [] }) },
      inbox: { unreadCount: { useQuery: () => ({ data: unreadCount() }) } },
    },
  },
}));

import { InboxFolderRail } from "./InboxFolderRail";

afterEach(() => {
  cleanup();
  unreadCount.mockReturnValue(0);
  xAccounts.mockReturnValue([]);
  pathname = "/inbox";
  searchParamsStr = "";
});

it("renders every folder as a link carrying ?folder= and marks the one from ?folder= active", () => {
  pathname = "/inbox";
  searchParamsStr = "folder=sent";
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute(
    "href",
    "/inbox?folder=inbox",
  );
  const sent = screen.getByRole("link", { name: /Sent/ });
  expect(sent).toHaveAttribute("href", "/inbox?folder=sent");
  expect(sent).toHaveAttribute("aria-current", "page");
  expect(screen.queryByText(/soon/)).toBeNull();
});

it("defaults the list route with no ?folder= to Inbox active", () => {
  pathname = "/inbox";
  searchParamsStr = "";
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");
});

it("keeps Inbox active on the reader route (a thread is open)", () => {
  pathname = "/inbox/thread-abc123";
  searchParamsStr = "";
  render(<InboxFolderRail newEmailEnabled={true} />);
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Sent/ })).not.toHaveAttribute("aria-current");
});

it("marks New email active on the compose route and leaves every folder inactive", () => {
  pathname = "/inbox/compose";
  searchParamsStr = "";
  render(<InboxFolderRail newEmailEnabled={true} />);
  expect(screen.getByRole("link", { name: /New email/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Inbox/ })).not.toHaveAttribute("aria-current");
});

it("New email is a disabled, non-navigating button without a mailbox", () => {
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.getByRole("button", { name: /New email/ })).toBeDisabled();
  expect(screen.queryByRole("link", { name: /New email/ })).not.toBeInTheDocument();
});

it("New email navigates to the full-pane compose route when a mailbox is connected", () => {
  render(<InboxFolderRail newEmailEnabled={true} />);
  expect(screen.getByRole("link", { name: /New email/ })).toHaveAttribute("href", "/inbox/compose");
});

it("shows an unread count badge on Inbox when the count is greater than zero", () => {
  unreadCount.mockReturnValue(3);
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.getByText("3")).toBeInTheDocument();
});

it("shows no badge when the unread count is zero", () => {
  unreadCount.mockReturnValue(0);
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.queryByText("0")).toBeNull();
});

it("re-derives the highlight on navigation without remounting the nav element", () => {
  pathname = "/inbox";
  searchParamsStr = "folder=inbox";
  const { rerender } = render(<InboxFolderRail newEmailEnabled={true} />);
  const navBefore = screen.getByRole("navigation", { name: "Mail folders" });
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");

  pathname = "/inbox/thread-xyz";
  searchParamsStr = "";
  rerender(<InboxFolderRail newEmailEnabled={true} />);
  const navAfter = screen.getByRole("navigation", { name: "Mail folders" });
  expect(navAfter).toBe(navBefore);
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");
});

it("rail lists X accounts with unread", () => {
  xAccounts.mockReturnValue([
    { id: "x1", displayName: "Brand X", username: "brand", unread: 4 },
    { id: "x2", displayName: "Support X", username: "support", unread: 0 },
  ]);
  pathname = "/inbox/x/x1";
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.getByText("Team")).toBeInTheDocument();
  const brand = screen.getByRole("link", { name: /Brand X/ });
  expect(brand).toHaveAttribute("href", "/inbox/x/x1");
  expect(brand).toHaveAttribute("aria-current", "page");
  expect(brand).toHaveTextContent("4");
  const support = screen.getByRole("link", { name: /Support X/ });
  expect(support).toHaveAttribute("href", "/inbox/x/x2");
  expect(support).not.toHaveTextContent("0");
  expect(screen.getByRole("link", { name: /Inbox/ })).not.toHaveAttribute("aria-current");
});

it("hides the Team section when there are no team mailboxes and no X accounts", () => {
  render(<InboxFolderRail newEmailEnabled={false} />);
  expect(screen.queryByText("Team")).toBeNull();
});
