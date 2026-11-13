// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InboxFolderRail } from "./InboxFolderRail";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams("mailbox=team"),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    xDms: { accounts: { useQuery: () => ({ data: [] }) } },
    email: {
      inbox: { unreadCount: { useQuery: () => ({ data: 0 }) } },
      mailboxes: {
        useQuery: () => ({ data: [{ id: "team", kind: "team", displayName: "Sales", unread: 3 }] }),
      },
    },
  },
}));
it("shows team entry and keeps folder navigation scoped", () => {
  render(<InboxFolderRail newEmailEnabled />);
  expect(screen.getByRole("link", { name: /Sales/ }).getAttribute("href")).toBe(
    "/inbox?mailbox=team",
  );
  expect(screen.getByRole("link", { name: "Sent" }).getAttribute("href")).toContain("mailbox=team");
});
