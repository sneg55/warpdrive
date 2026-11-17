// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const messagesQuery = vi.fn(() => ({ data: [] }));
const draftsQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    email: {
      listMessagesForDeal: { useQuery: (...a: unknown[]) => messagesQuery(...(a as [])) },
      drafts: { listForDeal: { useQuery: (...a: unknown[]) => draftsQuery(...(a as [])) } },
    },
    useUtils: () => ({
      email: {
        listMessagesForDeal: { invalidate: vi.fn() },
        drafts: { listForDeal: { invalidate: vi.fn() } },
      },
    }),
  },
}));
vi.mock("@/features/email/EmailDraftCard", () => ({
  EmailDraftCard: ({ draft }: { draft: { subject: string | null } }) => (
    <div data-testid="draft-card">{draft.subject}</div>
  ),
}));

import { WorkspaceTabs } from "./tabs";

afterEach(cleanup);

const deal = {
  id: "d1",
  title: "Deal",
  createdAt: new Date("2026-08-18T17:03:00Z"),
} as unknown as Parameters<typeof WorkspaceTabs>[0]["deal"];

const draft = {
  id: "draft-1",
  subject: "Unsent outreach",
  bodyHtml: "",
  toEmails: ["poc@example.com"],
  ccEmails: [],
  threadId: null,
  accountId: "acct-1",
  visibility: "shared" as const,
  linkDealId: "d1",
  linkPersonId: null,
  updatedAt: "2026-08-19T10:00:00Z",
};

describe("deal workspace drafts", () => {
  it("shows an unsent draft under the Email tab", () => {
    draftsQuery.mockReturnValue({ data: [draft] });

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

    expect(screen.getByTestId("draft-card")).toHaveTextContent("Unsent outreach");
  });

  it("keeps the Email tab empty state when there are neither emails nor drafts", () => {
    draftsQuery.mockReturnValue({ data: [] });

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

    expect(screen.getByText("No emails linked to this deal yet.")).toBeInTheDocument();
  });
});
