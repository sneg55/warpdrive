// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MASK_CLASS } from "@/features/observability/replayMasking";
import type { InboxThread } from "./emailReads";

vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => vi.fn(),
}));
vi.mock("./folderActions", () => ({
  archiveThreadAction: vi.fn(),
  unarchiveThreadAction: vi.fn(),
}));
vi.mock("./ThreadLabelChips", () => ({ ThreadLabelChips: () => null }));
vi.mock("./ThreadPrivacyToggle", () => ({ ThreadPrivacyToggle: () => null }));

import { ThreadRow } from "./ThreadRow";

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
  snippet: "Private email content",
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

it("masks the email snippet from session replay", () => {
  render(<ThreadRow {...props} />);

  expect(screen.getByText(/Private email content/)).toHaveClass(MASK_CLASS);
});
