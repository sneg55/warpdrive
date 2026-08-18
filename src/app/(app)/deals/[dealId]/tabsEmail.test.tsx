// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    email: { listMessagesForDeal: { useQuery: (...a: unknown[]) => listQuery(...a) } },
    useUtils: () => ({ email: { listMessagesForDeal: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("@/features/email/EmailTimelineCard", () => ({
  EmailTimelineCard: ({ message }: { message: { subject: string | null } }) => (
    <div data-testid="email-card">{message.subject}</div>
  ),
}));

import { WorkspaceTabs } from "./tabs";

afterEach(cleanup);

const deal = {
  id: "d1",
  title: "Deal",
  createdAt: new Date("2026-08-18T17:03:00Z"),
} as unknown as Parameters<typeof WorkspaceTabs>[0]["deal"];

const email = {
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

describe("deal workspace email timeline", () => {
  it("shows a linked email under All, interleaved with the created anchor", () => {
    listQuery.mockReturnValue({ data: [email] });

    render(
      <WorkspaceTabs
        deal={deal}
        tab="all"
        onTab={() => {}}
        activities={[]}
        stages={[]}
        createdActorName="Jenny"
      />,
    );

    expect(screen.getAllByTestId("email-card")[0]).toHaveTextContent("Follow up to our meeting");
    expect(screen.getByText(/Deal created/i)).toBeInTheDocument();
  });

  it("shows the same email under the Email tab and nothing else", () => {
    listQuery.mockReturnValue({ data: [email] });

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

    expect(screen.getAllByTestId("email-card")).toHaveLength(1);
    expect(screen.queryByText(/Deal created/i)).not.toBeInTheDocument();
  });

  it("says email could not be loaded rather than showing an empty timeline", () => {
    listQuery.mockReturnValue({ data: undefined, isError: true });

    render(
      <WorkspaceTabs
        deal={deal}
        tab="all"
        onTab={() => {}}
        activities={[]}
        stages={[]}
        createdActorName="Jenny"
      />,
    );

    expect(screen.getByText(/Couldn't load emails/i)).toBeInTheDocument();
    expect(screen.getByText(/Deal created/i)).toBeInTheDocument();
  });
});

// An in-flight or failed read carries no empty result to report, so the Email filter must say which
// of the three it is instead of defaulting to "none linked".
describe("deal workspace Email filter status", () => {
  function renderEmailTab(): void {
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
  }

  it("says the emails are loading while the read is in flight", () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderEmailTab();

    expect(screen.getByText("Loading emails...")).toBeInTheDocument();
    expect(screen.queryByText(/No emails linked/i)).not.toBeInTheDocument();
  });

  it("says the read failed rather than that the deal has no email", () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderEmailTab();

    expect(screen.getByText("Couldn't load emails. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/No emails linked/i)).not.toBeInTheDocument();
  });

  it("says no emails are linked only after a successful empty read", () => {
    listQuery.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderEmailTab();

    expect(screen.getByText("No emails linked to this deal yet.")).toBeInTheDocument();
  });
});
