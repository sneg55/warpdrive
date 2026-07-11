// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// SidebarLinkPanel is exercised in its own test; here we only assert the sidebar renders it with
// the thread's link context, so stub it to echo the props we care about.
const linkPanelProps = vi.fn();
vi.mock("./SidebarLinkPanel", () => ({
  SidebarLinkPanel: (props: Record<string, unknown>) => {
    linkPanelProps(props);
    return <div data-testid="link-panel" />;
  },
}));

import { InboxReaderSidebar } from "./InboxReaderSidebar";

afterEach(() => {
  cleanup();
  linkPanelProps.mockClear();
});

describe("InboxReaderSidebar", () => {
  it("shows the people count, the primary contact, and the link panel", () => {
    render(
      <InboxReaderSidebar
        participants={["jane@acme.com", "bob@acme.com"]}
        threadId="t1"
        personId={null}
        personName={null}
        dealId={null}
        dealTitle={null}
        subject="Renewal"
        primaryEmail="jane@acme.com"
        primaryName="Jane Doe"
        canCompose
        onLinked={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 people in this conversation/i)).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByTestId("link-panel")).toBeInTheDocument();
  });

  it("passes the thread's link context and owner gate to the panel", () => {
    render(
      <InboxReaderSidebar
        participants={["jane@acme.com"]}
        threadId="t1"
        personId="pe1"
        personName="Jane Doe"
        dealId={null}
        dealTitle={null}
        subject="Renewal"
        primaryEmail="jane@acme.com"
        primaryName="Jane Doe"
        canCompose={false}
        onLinked={vi.fn()}
      />,
    );
    expect(linkPanelProps).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "t1",
        personId: "pe1",
        personName: "Jane Doe",
        subject: "Renewal",
        primaryEmail: "jane@acme.com",
        canEdit: false,
      }),
    );
  });
});
