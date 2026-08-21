// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftSummary } from "@/features/email/draftRepo";
import type { HistoryItem } from "./historyTimeline";

vi.mock("@/features/email/EmailDraftCard", () => ({
  EmailDraftCard: ({
    draft,
    onResume,
  }: {
    draft: DraftSummary;
    onResume: (d: DraftSummary) => void;
  }) => (
    <button type="button" data-testid="draft-card" onClick={() => onResume(draft)}>
      {draft.subject}
    </button>
  ),
}));

import { HistoryFeed } from "./HistoryFeed";

afterEach(cleanup);

const draft: DraftSummary = {
  id: "d1",
  subject: "Unsent outreach",
  bodyHtml: "<p>hi</p>",
  toEmails: ["poc@example.com"],
  ccEmails: [],
  threadId: null,
  accountId: "acct-1",
  visibility: "shared",
  linkDealId: "deal-1",
  linkPersonId: null,
  updatedAt: "2026-08-19T10:00:00Z",
};

const items: HistoryItem[] = [
  { kind: "emailDraft", id: "d1", at: new Date("2026-08-19T10:00:00Z"), draft },
  { kind: "created", id: "created", at: new Date("2026-08-18T17:03:00Z"), actorName: "Jenny" },
];

describe("HistoryFeed with draft items", () => {
  it("renders a draft card interleaved with the other kinds", () => {
    render(<HistoryFeed items={items} emptyLabel="No history yet." />);

    expect(screen.getByTestId("draft-card")).toHaveTextContent("Unsent outreach");
    expect(screen.getByText(/Deal created/i)).toBeInTheDocument();
  });

  it("forwards a resume up to the host that owns the composer", async () => {
    const onResumeDraft = vi.fn();
    render(
      <HistoryFeed items={items} emptyLabel="No history yet." onResumeDraft={onResumeDraft} />,
    );

    await userEvent.click(screen.getByTestId("draft-card"));

    expect(onResumeDraft).toHaveBeenCalledWith(draft);
  });
});
