// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const invalidateDealMessages = vi.fn(() => Promise.resolve());
const invalidateContactMessages = vi.fn(() => Promise.resolve());
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      email: {
        listMessagesForDeal: { invalidate: invalidateDealMessages },
        listMessagesForContact: { invalidate: invalidateContactMessages },
      },
    }),
  },
}));

vi.mock("@/features/deal-workspace/composer/ActivityComposerInline", () => ({
  ActivityComposerInline: () => <div data-testid="activity-form" />,
}));
vi.mock("@/features/email/Composer", () => ({
  Composer: ({ onSent }: { onSent: () => void }) => (
    <button type="button" onClick={onSent}>
      Send
    </button>
  ),
}));
vi.mock("@/features/files/FileAttachments", () => ({ FileAttachments: () => <div /> }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { SharedComposeBar } from "./SharedComposeBar";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDealBar(): void {
  render(
    <SharedComposeBar
      scope={{ entityType: "deal", entityId: "d1", personId: "p1" }}
      emailAccountId="acct1"
      onActivityCreated={vi.fn()}
      onNoteCreated={vi.fn()}
    />,
  );
}

it("refreshes the deal and person timelines after a send from the record composer", async () => {
  renderDealBar();
  await userEvent.click(screen.getByRole("tab", { name: "Email" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(invalidateDealMessages).toHaveBeenCalledTimes(1);
  expect(invalidateContactMessages).toHaveBeenCalledTimes(1);
});

it("still collapses back to the activity prompt after a send", async () => {
  renderDealBar();
  await userEvent.click(screen.getByRole("tab", { name: "Email" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(
    screen.getByRole("button", { name: "Click here to add an activity..." }),
  ).toBeInTheDocument();
});
