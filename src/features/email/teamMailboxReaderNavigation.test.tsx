// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
const searchParamsStr = "folder=inbox&mailbox=team-id";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(searchParamsStr),
}));

type Neighbors = {
  prevId: string | null;
  nextId: string | null;
  index: number;
  total: number;
} | null;
const neighborsData: Neighbors = null;
const invalidateAll = vi.fn();
const inv = () => ({ invalidate: invalidateAll });
const invalidateDealMessages = vi.fn();
const invalidateContactMessages = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: { thread: { neighbors: { useQuery: () => ({ data: neighborsData }) } } },
    useUtils: () => ({
      email: {
        inbox: { list: inv(), unreadCount: inv() },
        folders: { sent: inv(), archive: inv() },
        search: inv(),
        thread: { get: inv() },
        listMessagesForDeal: { invalidate: invalidateDealMessages },
        listMessagesForContact: { invalidate: invalidateContactMessages },
      },
    }),
  },
}));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

const archiveMock = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: (...a: unknown[]) => archiveMock(...(a as [])),
}));
const trashMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
vi.mock("./actions", () => ({
  trashThreadAction: (...a: unknown[]) => trashMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ReaderTopBar } from "./ReaderTopBar";

it("returns to the team mailbox after opening and archiving its thread", async () => {
  render(<ReaderTopBar threadId="t1" canManage />);
  expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
    "href",
    "/inbox?mailbox=team-id",
  );
  screen.getByRole("button", { name: "Archive" }).click();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox?mailbox=team-id"));
});
