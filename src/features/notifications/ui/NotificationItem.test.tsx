// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationFeedItem } from "@/types/notification";
import { NotificationItem } from "./NotificationItem";

afterEach(cleanup);

const base: NotificationFeedItem = {
  id: "n1",
  userId: "u1",
  type: "mention",
  entityType: "deal",
  entityId: "d1",
  actorId: "u2",
  payload: { title: "Acme renewal" },
  readAt: null,
  createdAt: new Date().toISOString(),
  band: "today",
};

describe("NotificationItem", () => {
  it("shows an unread indicator for an unread item and calls onOpen", () => {
    const onOpen = vi.fn();
    render(<NotificationItem item={base} onOpen={onOpen} />);
    expect(screen.getByTestId("unread-dot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("renders an inbound deal email with its subject", () => {
    render(
      <NotificationItem
        item={{
          ...base,
          type: "deal_email_received",
          payload: { subject: "Re: Valley Metro procurement", threadId: "t1" },
        }}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("New email: Re: Valley Metro procurement")).toBeInTheDocument();
  });

  it("falls back when an inbound deal email has no subject", () => {
    render(
      <NotificationItem
        item={{ ...base, type: "deal_email_received", payload: { subject: null } }}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("New email: on a deal")).toBeInTheDocument();
  });

  it("hides the unread indicator once read", () => {
    render(
      <NotificationItem item={{ ...base, readAt: new Date().toISOString() }} onOpen={() => {}} />,
    );
    expect(screen.queryByTestId("unread-dot")).not.toBeInTheDocument();
  });

  it("hovers a read row with a theme token, and gives the unread tint a Night pair", () => {
    render(
      <NotificationItem item={{ ...base, readAt: new Date().toISOString() }} onOpen={() => {}} />,
    );
    const read = screen.getByRole("button");
    expect(read).toHaveClass("hover:bg-accent");
    expect(read.className).not.toMatch(/-gray-/);
    cleanup();
    render(<NotificationItem item={base} onOpen={() => {}} />);
    expect(screen.getByRole("button")).toHaveClass("dark:bg-blue-950/50");
  });
});
