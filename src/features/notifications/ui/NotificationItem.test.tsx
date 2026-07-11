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

  it("hides the unread indicator once read", () => {
    render(
      <NotificationItem item={{ ...base, readAt: new Date().toISOString() }} onOpen={() => {}} />,
    );
    expect(screen.queryByTestId("unread-dot")).not.toBeInTheDocument();
  });
});
