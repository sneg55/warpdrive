// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";
import type { SupportConversationSummary } from "@/features/intercom/supportTypes";

vi.mock("@/lib/trpc-client", () => ({ trpc: { useUtils: () => ({}) } }));
vi.mock("@/features/intercom/SupportConversationCard", () => ({
  SupportConversationCard: ({ conversation }: { conversation: SupportConversationSummary }) => (
    <div data-testid="support-card">{conversation.title}</div>
  ),
}));

import { LeadTimeline } from "./LeadTimeline";

afterEach(cleanup);

const items: HistoryItem[] = [
  {
    kind: "supportConversation",
    id: "intercom-c1",
    at: new Date("2026-08-18T17:04:00Z"),
    conversation: {
      id: "c1",
      title: "Refund request",
      snippet: null,
      state: "open",
      messageCount: 1,
      lastReplierName: null,
      lastReplierType: null,
      lastPartAt: "2026-08-18T17:04:00Z",
    },
    scope: { kind: "lead", leadId: "l1" },
  },
];

describe("LeadTimeline support conversations", () => {
  it("shows a conversation under All", () => {
    render(<LeadTimeline items={items} emails={[]} />);
    expect(screen.getByTestId("support-card")).toHaveTextContent("Refund request");
  });

  it("shows a conversation under Email instead of the no-email line", async () => {
    render(<LeadTimeline items={items} emails={[]} />);
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));
    expect(screen.getByTestId("support-card")).toHaveTextContent("Refund request");
    expect(screen.queryByText("No emails linked to this lead yet.")).toBeNull();
  });
});
