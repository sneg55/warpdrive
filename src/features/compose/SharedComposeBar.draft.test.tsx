// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { DraftSummary } from "@/features/email/draftRepo";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      email: {
        listMessagesForDeal: { invalidate: vi.fn() },
        listMessagesForContact: { invalidate: vi.fn() },
      },
    }),
  },
}));
vi.mock("@/features/deal-workspace/composer/ActivityComposerInline", () => ({
  ActivityComposerInline: () => <div data-testid="activity-form" />,
}));
vi.mock("@/features/email/Composer", () => ({
  Composer: ({ draft }: { draft?: { id: string; subject: string } }) => (
    <div data-testid="composer">{draft === undefined ? "fresh" : `resumed:${draft.subject}`}</div>
  ),
}));
vi.mock("@/features/files/FileAttachments", () => ({ FileAttachments: () => <div /> }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { SharedComposeBar } from "./SharedComposeBar";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const draft: DraftSummary = {
  id: "draft-1",
  subject: "Unsent outreach",
  bodyHtml: "<p>hi</p>",
  toEmails: ["poc@example.com"],
  ccEmails: [],
  threadId: null,
  accountId: "acct1",
  visibility: "shared",
  linkDealId: "d1",
  linkPersonId: null,
  updatedAt: "2026-08-19T10:00:00Z",
};

function renderBar(resumeDraft: DraftSummary | null): void {
  render(
    <SharedComposeBar
      scope={{ entityType: "deal", entityId: "d1", personId: "p1" }}
      emailAccountId="acct1"
      resumeDraft={resumeDraft}
      onActivityCreated={vi.fn()}
      onNoteCreated={vi.fn()}
    />,
  );
}

it("opens the Email tab seeded with the draft the timeline handed it", () => {
  renderBar(draft);

  expect(screen.getByTestId("composer")).toHaveTextContent("resumed:Unsent outreach");
});

it("stays on the collapsed activity prompt when no draft is being resumed", () => {
  renderBar(null);

  expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Click here to add an activity..." })).toBeVisible();
});
