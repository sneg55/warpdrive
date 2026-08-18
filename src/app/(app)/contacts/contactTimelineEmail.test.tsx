// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const listQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: { contactTimeline: { useQuery: () => ({ data: { items: [] } }) } },
    email: { listMessagesForContact: { useQuery: (...a: unknown[]) => listQuery(...a) } },
    useUtils: () => ({
      contacts: {
        contactTimeline: { invalidate: vi.fn() },
        activityStats: { invalidate: vi.fn() },
      },
      email: { listMessagesForContact: { invalidate: vi.fn() } },
    }),
  },
}));
vi.mock("@/features/email/EmailTimelineCard", () => ({
  EmailTimelineCard: ({ message }: { message: { subject: string | null } }) => (
    <div data-testid="email-card">{message.subject}</div>
  ),
}));

import { ContactTimelinePanel } from "./contactDetail.shared";

afterEach(cleanup);

const email = {
  messageId: "m1",
  threadId: "t1",
  subject: "Hi Steve",
  sentAt: "2026-08-18T17:04:00Z",
  createdAt: "2026-08-18T17:04:01Z",
  direction: "outbound",
  fromEmail: "me@example.com",
  fromName: "Me",
  toEmails: ["steve@example.com"],
  snippet: "Hello",
  hasAttachment: false,
  canCompose: true,
};

describe("person timeline email", () => {
  it("renders a linked email in the person timeline", () => {
    listQuery.mockReturnValue({ data: [email] });

    render(<ContactTimelinePanel entityType="person" entityId="p1" />);

    expect(screen.getAllByTestId("email-card")[0]).toHaveTextContent("Hi Steve");
  });

  it("says the emails are loading while the read is in flight", async () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<ContactTimelinePanel entityType="person" entityId="p1" />);
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));

    expect(screen.getByText("Loading emails...")).toBeInTheDocument();
    expect(screen.queryByText(/No emails linked/i)).not.toBeInTheDocument();
  });

  it("says the read failed rather than that the person has no email", async () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<ContactTimelinePanel entityType="person" entityId="p1" />);
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));

    expect(screen.getByText("Couldn't load emails. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/No emails linked/i)).not.toBeInTheDocument();
  });

  it("says no emails are linked only after a successful empty read", async () => {
    listQuery.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<ContactTimelinePanel entityType="person" entityId="p1" />);
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));

    expect(screen.getByText("No emails linked to this contact yet.")).toBeInTheDocument();
  });

  it("keeps the organization explanation, whose read never runs at all", async () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    render(<ContactTimelinePanel entityType="organization" entityId="o1" />);
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));

    expect(screen.getByText("Email is tracked on people, not organizations.")).toBeInTheDocument();
  });

  it("does not query linked email for an organization", () => {
    listQuery.mockReturnValue({ data: undefined });

    render(<ContactTimelinePanel entityType="organization" entityId="o1" />);

    expect(listQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });
});
