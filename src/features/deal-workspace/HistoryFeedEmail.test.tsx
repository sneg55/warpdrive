// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailTimelineMessage } from "@/features/email/entityMessageReads";
import type { HistoryItem } from "./historyTimeline";

vi.mock("@/features/email/EmailTimelineCard", () => ({
  EmailTimelineCard: ({ message }: { message: EmailTimelineMessage }) => (
    <div data-testid="email-card">{message.subject}</div>
  ),
}));

import { HistoryFeed } from "./HistoryFeed";

afterEach(cleanup);

const message: EmailTimelineMessage = {
  messageId: "m1",
  threadId: "t1",
  subject: "Follow up to our meeting",
  sentAt: "2026-08-18T17:04:00Z",
  createdAt: "2026-08-18T17:04:01Z",
  direction: "inbound",
  fromEmail: "chris@pipedrive.com",
  fromName: "Christopher Ramirez",
  toEmails: ["jenny@example.com"],
  snippet: "Hello",
  hasAttachment: false,
  canCompose: true,
};

const items: HistoryItem[] = [
  { kind: "email", id: "m1", at: new Date("2026-08-18T17:04:00Z"), message },
  { kind: "created", id: "created", at: new Date("2026-08-18T17:03:00Z"), actorName: "Jenny" },
];

describe("HistoryFeed with email items", () => {
  it("renders an email card interleaved with the other kinds", () => {
    render(
      <HistoryFeed
        items={items}
        emptyLabel="No history yet."
        emailScope={{ kind: "deal", dealId: "d1" }}
      />,
    );

    expect(screen.getByTestId("email-card")).toHaveTextContent("Follow up to our meeting");
    expect(screen.getByText(/Deal created/i)).toBeInTheDocument();
  });

  it("marks the email row with an envelope rather than the neutral dot", () => {
    const { container } = render(
      <HistoryFeed
        items={items}
        emptyLabel="No history yet."
        emailScope={{ kind: "deal", dealId: "d1" }}
      />,
    );

    expect(container.querySelector('[data-rail="email"]')).toBeInTheDocument();
  });

  it("renders nothing for an email item when no scope is supplied", () => {
    render(<HistoryFeed items={items} emptyLabel="No history yet." />);

    expect(screen.queryByTestId("email-card")).not.toBeInTheDocument();
  });
});
