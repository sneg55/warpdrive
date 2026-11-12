// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupportConversationSummary } from "@/features/intercom/supportTypes";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: { contactTimeline: { useQuery: () => ({ data: { items: [] } }) } },
    email: { listMessagesForContact: { useQuery: () => ({ data: [], isError: false }) } },
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
    useUtils: () => ({}),
  },
}));
const hookScope = vi.fn();
vi.mock("@/features/intercom/useSupportConversations", () => ({
  useSupportConversations: (scope: unknown) => {
    hookScope(scope);
    const rows: SupportConversationSummary[] =
      scope === null
        ? []
        : [
            {
              id: "c1",
              title: "Login trouble",
              snippet: null,
              state: "closed",
              messageCount: 4,
              lastReplierName: "Agent",
              lastReplierType: "admin",
              lastPartAt: "2026-08-18T17:04:00Z",
            },
          ];
    return rows;
  },
}));
vi.mock("@/features/intercom/SupportConversationCard", () => ({
  SupportConversationCard: ({ conversation }: { conversation: SupportConversationSummary }) => (
    <div data-testid="support-card">{conversation.title}</div>
  ),
}));

import { ContactTimelinePanel } from "./contactDetail.shared";

afterEach(cleanup);

describe("person timeline support conversations", () => {
  it("lists the person's conversations under Email", async () => {
    render(<ContactTimelinePanel entityType="person" entityId="p1" />);
    expect(hookScope).toHaveBeenCalledWith({ kind: "person", personId: "p1" });
    await userEvent.click(screen.getByRole("tab", { name: "Email (1)" }));
    expect(screen.getByTestId("support-card")).toHaveTextContent("Login trouble");
  });

  it("asks for nothing on an organization", () => {
    render(<ContactTimelinePanel entityType="organization" entityId="o1" />);
    expect(hookScope).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId("support-card")).toBeNull();
  });
});
