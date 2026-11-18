// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const push = vi.fn();
let searchParamsStr = "folder=archive";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParamsStr),
}));

const inv = () => ({ invalidate: vi.fn() });
const invalidateThreadGet = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: { thread: { neighbors: { useQuery: () => ({ data: null }) } } },
    useUtils: () => ({
      email: {
        inbox: { list: inv(), unreadCount: inv() },
        folders: { sent: inv(), archive: inv() },
        search: inv(),
        thread: { get: { invalidate: invalidateThreadGet } },
        listMessagesForDeal: inv(),
        listMessagesForContact: inv(),
      },
    }),
  },
}));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

const archiveMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
const unarchiveMock = vi.fn(() => Promise.resolve({ ok: true, value: { threadId: "t1" } }));
vi.mock("./folderActions", () => ({
  archiveThreadAction: (...a: unknown[]) => archiveMock(...(a as [])),
  unarchiveThreadAction: (...a: unknown[]) => unarchiveMock(...(a as [])),
}));
vi.mock("./actions", () => ({ trashThreadAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ERROR_IDS } from "@/constants/errorIds";
import { ReaderTopBar } from "./ReaderTopBar";

afterEach(() => {
  cleanup();
  push.mockClear();
  reportError.mockClear();
  archiveMock.mockClear();
  unarchiveMock.mockClear();
  invalidateThreadGet.mockClear();
  searchParamsStr = "folder=archive";
});

it("offers Unarchive for an archived thread and returns to the Archive folder it came from", async () => {
  render(<ReaderTopBar threadId="t1" canManage archived />);
  expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  screen.getByRole("button", { name: "Unarchive" }).click();
  await waitFor(() => expect(unarchiveMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
  expect(archiveMock).not.toHaveBeenCalled();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox?folder=archive"));
});

it("offers Archive for an unarchived thread opened from an Archive-folder search", async () => {
  render(<ReaderTopBar threadId="t1" canManage archived={false} />);
  expect(screen.queryByRole("button", { name: "Unarchive" })).toBeNull();
  screen.getByRole("button", { name: "Archive" }).click();
  await waitFor(() => expect(archiveMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
  expect(unarchiveMock).not.toHaveBeenCalled();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox?folder=archive"));
});

it("offers Unarchive for an archived thread opened outside the Archive folder", async () => {
  searchParamsStr = "folder=inbox";
  render(<ReaderTopBar threadId="t1" canManage archived />);
  screen.getByRole("button", { name: "Unarchive" }).click();
  await waitFor(() => expect(unarchiveMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox"));
});

it("keeps Archive disabled after a successful archive so a second click cannot fire", async () => {
  searchParamsStr = "folder=inbox";
  render(<ReaderTopBar threadId="t1" canManage archived={false} />);
  screen.getByRole("button", { name: "Archive" }).click();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox"));
  expect(screen.getByRole("button", { name: /Archiving/ })).toBeDisabled();
});

it("re-enables Archive and reports when the action rejects instead of answering", async () => {
  searchParamsStr = "folder=inbox";
  archiveMock.mockRejectedValueOnce(new Error("network"));
  render(<ReaderTopBar threadId="t1" canManage archived={false} />);
  screen.getByRole("button", { name: "Archive" }).click();
  await waitFor(() => expect(reportError).toHaveBeenCalledWith(ERROR_IDS.UI_ACTION_UNCONFIRMED));
  expect(screen.getByRole("button", { name: "Archive" })).not.toBeDisabled();
});

it("drops the cached thread after a toggle so reopening it shows the new archived state", async () => {
  render(<ReaderTopBar threadId="t1" canManage archived />);
  screen.getByRole("button", { name: "Unarchive" }).click();
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(invalidateThreadGet).toHaveBeenCalledWith({ threadId: "t1" });
});
