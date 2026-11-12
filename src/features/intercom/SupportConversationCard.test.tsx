// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportConversationSummary, SupportScope } from "./supportTypes";

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { intercom: { parts: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));

import { buildConversationHtml } from "./conversationHtml";
import { SupportConversationCard } from "./SupportConversationCard";

const scope: SupportScope = { kind: "deal", dealId: "d1" };

function conv(over: Partial<SupportConversationSummary> = {}): SupportConversationSummary {
  return {
    id: "c1",
    title: "Billing question",
    snippet: "My invoice is wrong",
    state: "open",
    messageCount: 3,
    lastReplierName: "Alex Agent",
    lastReplierType: "admin",
    lastPartAt: "2026-08-02T10:00:00Z",
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  useQuery.mockReset();
  useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

describe("SupportConversationCard", () => {
  it("shows the title, state, count and last replier collapsed, without loading parts", () => {
    render(<SupportConversationCard conversation={conv()} scope={scope} />);
    expect(screen.getByRole("heading", { name: "Billing question" })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("3 messages")).toBeInTheDocument();
    expect(screen.getByText("Last reply by Alex Agent")).toBeInTheDocument();
    expect(useQuery).toHaveBeenCalledWith(
      { conversationId: "c1", scope, allowRemote: false },
      { enabled: false },
    );
  });

  it("falls back to the opening snippet when the conversation has no title", () => {
    render(<SupportConversationCard conversation={conv({ title: null })} scope={scope} />);
    expect(screen.getByRole("heading", { name: "My invoice is wrong" })).toBeInTheDocument();
  });

  it("loads the parts on expand and renders them in a sandboxed frame", async () => {
    useQuery.mockReturnValue({
      data: [
        {
          id: "source-c1",
          partType: "source",
          authorType: "user",
          authorName: "Pat <Customer>",
          createdAt: "2026-08-01T10:00:00Z",
          bodyHtml: "<p>My invoice is wrong</p>",
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<SupportConversationCard conversation={conv()} scope={scope} />);
    await userEvent.click(screen.getByRole("button", { name: "Show conversation" }));
    expect(useQuery).toHaveBeenLastCalledWith(
      { conversationId: "c1", scope, allowRemote: false },
      { enabled: true },
    );
    const frame = screen.getByTitle("support conversation");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
  });

  it("says so when the parts fail to load", async () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<SupportConversationCard conversation={conv()} scope={scope} />);
    await userEvent.click(screen.getByRole("button", { name: "Show conversation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this conversation.");
  });
});

describe("buildConversationHtml", () => {
  it("escapes author names and keeps the sanitized bodies in order", () => {
    const html = buildConversationHtml(
      [
        {
          id: "a",
          partType: "source",
          authorType: "user",
          authorName: "<b>Pat</b>",
          createdAt: "2026-08-01T10:00:00Z",
          bodyHtml: "<p>first</p>",
        },
        {
          id: "b",
          partType: "comment",
          authorType: "admin",
          authorName: null,
          createdAt: "2026-08-01T11:00:00Z",
          bodyHtml: "<p>second</p>",
        },
      ],
      (iso) => `at ${iso}`,
    );
    expect(html).toContain("&lt;b&gt;Pat&lt;/b&gt;");
    expect(html).not.toContain("<b>Pat</b>");
    expect(html).toContain("Unknown");
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
  });
});
