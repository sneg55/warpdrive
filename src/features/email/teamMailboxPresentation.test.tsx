// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InboxNavBadge } from "./InboxNavBadge";
import { TeamReplyChip } from "./TeamReplyChip";

const state = vi.hoisted(() => ({ count: 3 }));
vi.mock("./useInboxRealtime", () => ({ useInboxRealtime: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { email: { inbox: { unreadCount: { useQuery: () => ({ data: state.count }) } } } },
}));
it("renders reply labels and the exact overdue boundary", () => {
  const now = new Date("2026-01-02T00:00:00Z").getTime();
  const view = render(
    <TeamReplyChip
      now={now}
      status={{ kind: "unanswered", waitingSince: "2026-01-01T01:00:00Z", overdueAfterHours: 24 }}
    />,
  );
  expect(screen.getByText("Unanswered 23h").className).toContain("amber");
  view.rerender(
    <TeamReplyChip
      now={now}
      status={{ kind: "unanswered", waitingSince: "2026-01-01T00:00:00Z", overdueAfterHours: 24 }}
    />,
  );
  expect(screen.getByText("Unanswered 1d").className).toContain("red");
  view.rerender(<TeamReplyChip status={{ kind: "replied", byName: "Sam" }} />);
  expect(screen.getByText("Replied · Sam")).toBeTruthy();
  view.rerender(<TeamReplyChip status={null} />);
  expect(view.container.textContent).toBe("");
});
it("hides the aggregate nav badge at zero", () => {
  const view = render(<InboxNavBadge selfActorId="actor" />);
  expect(screen.getByLabelText("3 unread emails").textContent).toBe("3");
  state.count = 0;
  view.rerender(<InboxNavBadge selfActorId="actor" />);
  expect(view.container.textContent).toBe("");
});
