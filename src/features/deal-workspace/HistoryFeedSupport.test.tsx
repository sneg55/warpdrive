// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupportConversationSummary } from "@/features/intercom/supportTypes";
import type { HistoryItem } from "./historyTimeline";

vi.mock("@/features/intercom/SupportConversationCard", () => ({
  SupportConversationCard: ({ conversation }: { conversation: SupportConversationSummary }) => (
    <div data-testid="support-card">{conversation.title}</div>
  ),
}));

import { HistoryFeed } from "./HistoryFeed";

afterEach(cleanup);

const conversation: SupportConversationSummary = {
  id: "c1",
  title: "Billing question",
  snippet: null,
  state: "closed",
  messageCount: 2,
  lastReplierName: "Agent",
  lastReplierType: "admin",
  lastPartAt: "2026-08-18T17:04:00Z",
};

const items: HistoryItem[] = [
  {
    kind: "supportConversation",
    id: "intercom-c1",
    at: new Date("2026-08-18T17:04:00Z"),
    conversation,
    scope: { kind: "lead", leadId: "l1" },
  },
];

describe("HistoryFeed with support conversations", () => {
  it("renders the card even on a surface without an email scope", () => {
    const { container } = render(<HistoryFeed items={items} emptyLabel="Nothing" />);
    expect(screen.getByTestId("support-card")).toHaveTextContent("Billing question");
    expect(container.querySelector('[data-rail="support"]')).not.toBeNull();
  });
});
