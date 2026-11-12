// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupportConversationSummary, SupportScope } from "@/features/intercom/supportTypes";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    email: {
      listMessagesForDeal: { useQuery: () => ({ data: [] }) },
      drafts: { listForDeal: { useQuery: () => ({ data: [] }) } },
    },
    useUtils: () => ({}),
  },
}));
const hookScope = vi.fn();
const conversations: SupportConversationSummary[] = [
  {
    id: "c1",
    title: "Billing question",
    snippet: null,
    state: "open",
    messageCount: 2,
    lastReplierName: "Agent",
    lastReplierType: "admin",
    lastPartAt: "2026-08-18T17:04:00Z",
  },
];
vi.mock("@/features/intercom/useSupportConversations", () => ({
  useSupportConversations: (scope: SupportScope) => {
    hookScope(scope);
    return conversations;
  },
}));
const cardScope = vi.fn();
vi.mock("@/features/intercom/SupportConversationCard", () => ({
  SupportConversationCard: (props: {
    conversation: SupportConversationSummary;
    scope: unknown;
  }) => {
    cardScope(props.scope);
    return <div data-testid="support-card">{props.conversation.title}</div>;
  },
}));

import { WorkspaceTabs } from "./tabs";

afterEach(cleanup);

const deal = {
  id: "d1",
  title: "Deal",
  personId: "p1",
  createdAt: new Date("2026-08-18T17:03:00Z"),
} as unknown as Parameters<typeof WorkspaceTabs>[0]["deal"];

describe("deal workspace support conversations", () => {
  it("shows the deal's conversations under Email and counts them", () => {
    render(
      <WorkspaceTabs
        deal={deal}
        tab="email"
        onTab={() => {}}
        activities={[]}
        stages={[]}
        createdActorName="Jenny"
      />,
    );
    expect(hookScope).toHaveBeenCalledWith({ kind: "deal", dealId: "d1" });
    expect(screen.getByTestId("support-card")).toHaveTextContent("Billing question");
    expect(cardScope).toHaveBeenCalledWith({ kind: "deal", dealId: "d1" });
    expect(screen.getByRole("tab", { name: "Email (1)" })).toBeInTheDocument();
  });
});
