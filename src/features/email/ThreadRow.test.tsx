// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxThread } from "./emailReads";

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

const archiveMock = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
const unarchiveMock = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: (...a: unknown[]) => archiveMock(...(a as [])),
  unarchiveThreadAction: (...a: unknown[]) => unarchiveMock(...(a as [])),
}));
// Server action pulls in db/context; mock it so the row renders in jsdom.
const setVisibilityMock = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
vi.mock("./threadVisibilityActions", () => ({
  setThreadVisibilityAction: (...a: unknown[]) => setVisibilityMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
// ThreadRow renders ThreadLabelChips, which resolves labels against the mail-label catalog.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    mailLabels: {
      list: {
        useQuery: () => ({
          data: [{ id: "l1", key: "important", name: "Important", color: "red", order: 0 }],
        }),
      },
    },
  },
}));

import { ThreadRow } from "./ThreadRow";

afterEach(() => {
  cleanup();
  reportError.mockClear();
  archiveMock.mockClear();
});

const thread: InboxThread = {
  id: "t1",
  subject: "Hello",
  lastMessageAt: null,
  personId: "p1",
  dealId: null,
  visibility: "private",
  unread: false,
  followUpStatus: null,
  labels: [],
  isOwner: false,
  senderEmail: null,
  senderName: null,
  snippet: null,
  hasAttachment: false,
};

const props = {
  thread,
  folder: "inbox" as const,
  active: false,
  selected: false,
  onToggleSelected: () => {},
  onOpen: () => {},
  onArchiveDone: () => {},
};

it("reports the error id when archiving is denied (no silent no-op)", async () => {
  archiveMock.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
  const onArchiveDone = vi.fn();
  render(<ThreadRow {...props} onArchiveDone={onArchiveDone} />);

  screen.getByRole("button", { name: "Archive" }).click();

  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(onArchiveDone).not.toHaveBeenCalled();
});

it("shows the sender display name when present (Pipedrive parity)", () => {
  render(
    <ThreadRow
      {...props}
      thread={{ ...thread, senderEmail: "support@scrape.do", senderName: "Scrape.do Team" }}
    />,
  );
  expect(screen.getByText("Scrape.do Team")).toBeInTheDocument();
  // The raw address must not be shown once a name is available.
  expect(screen.queryByText("support@scrape.do")).not.toBeInTheDocument();
});

it("falls back to the sender email when no display name is stored", () => {
  render(
    <ThreadRow
      {...props}
      thread={{ ...thread, senderEmail: "support@scrape.do", senderName: null }}
    />,
  );
  expect(screen.getByText("support@scrape.do")).toBeInTheDocument();
});

it("renders the correspondent column in a non-Inbox folder row (Sent)", () => {
  render(
    <ThreadRow
      {...props}
      folder="sent"
      thread={{ ...thread, senderEmail: "client@acme.com", senderName: "Ada Client" }}
    />,
  );
  expect(screen.getByText("Ada Client")).toBeInTheDocument();
});

it("renders a colored chip for each of the thread's labels", () => {
  render(<ThreadRow {...props} thread={{ ...thread, labels: ["important"] }} />);
  expect(screen.getByText("Important")).toBeInTheDocument();
});

it("shows the privacy toggle only to the mailbox owner", () => {
  const { rerender } = render(<ThreadRow {...props} thread={{ ...thread, isOwner: true }} />);
  expect(screen.getByRole("button", { name: "Private conversation" })).toBeInTheDocument();

  rerender(<ThreadRow {...props} thread={{ ...thread, isOwner: false }} />);
  expect(screen.queryByRole("button", { name: "Private conversation" })).not.toBeInTheDocument();
});

it("shows an attachment indicator only when the thread has an attachment", () => {
  const { rerender } = render(<ThreadRow {...props} thread={{ ...thread, hasAttachment: true }} />);
  expect(screen.getByLabelText("Has attachment")).toBeInTheDocument();

  rerender(<ThreadRow {...props} thread={{ ...thread, hasAttachment: false }} />);
  expect(screen.queryByLabelText("Has attachment")).not.toBeInTheDocument();
});

// U7 row visual polish (assert classes/structure, not px, since jsdom has no layout).
describe("ThreadRow U7 visual polish", () => {
  it("renders the row date at the larger font (A14: text-sm, not text-xs)", () => {
    render(<ThreadRow {...props} thread={{ ...thread, lastMessageAt: "2026-07-02T10:00:00Z" }} />);
    const dateEl = screen.getByText(/Jul 2/);
    expect(dateEl).toHaveClass("text-sm");
    expect(dateEl).not.toHaveClass("text-xs");
  });

  it("renders the label chip before the subject (A15)", () => {
    render(
      <ThreadRow {...props} thread={{ ...thread, subject: "Hello", labels: ["important"] }} />,
    );
    const chip = screen.getByText("Important");
    const subject = screen.getByText("Hello");
    // DOCUMENT_POSITION_FOLLOWING (4) means subject comes after the chip in document order.
    expect(chip.compareDocumentPosition(subject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sizes the sender column to content, not a fixed 176px width (A18)", () => {
    render(
      <ThreadRow
        {...props}
        thread={{ ...thread, senderEmail: "client@acme.com", senderName: "Ada Client" }}
      />,
    );
    expect(screen.getByText("Ada Client")).not.toHaveClass("w-44");
  });

  it("gives the owner privacy affordance a dropdown caret next to the lock (A16)", () => {
    const { container, rerender } = render(
      <ThreadRow {...props} thread={{ ...thread, isOwner: true }} />,
    );
    expect(container.querySelector("[data-privacy-caret]")).toBeInTheDocument();

    rerender(<ThreadRow {...props} thread={{ ...thread, isOwner: false }} />);
    expect(container.querySelector("[data-privacy-caret]")).not.toBeInTheDocument();
  });
});
