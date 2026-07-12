// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
let searchParamsStr = "folder=inbox";
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
let neighborsData: Neighbors = null;
const invalidateAll = vi.fn();
const inv = () => ({ invalidate: invalidateAll });
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: { thread: { neighbors: { useQuery: () => ({ data: neighborsData }) } } },
    useUtils: () => ({
      email: {
        inbox: { list: inv(), unreadCount: inv() },
        folders: { sent: inv(), archive: inv() },
        search: inv(),
        thread: { get: inv() },
        forDeal: inv(),
        forContact: inv(),
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

afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
  reportError.mockClear();
  archiveMock.mockClear();
  trashMock.mockClear();
  trashMock.mockResolvedValue({ ok: true, value: { threadId: "t1" } });
  invalidateAll.mockClear();
  searchParamsStr = "folder=inbox";
  neighborsData = null;
});

it("links Back to the inbox", () => {
  render(<ReaderTopBar threadId="t1" canManage />);
  expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/inbox");
});

it("archives then returns to the inbox on success", async () => {
  render(<ReaderTopBar threadId="t1" canManage />);
  screen.getByRole("button", { name: "Archive" }).click();
  await waitFor(() => expect(archiveMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox"));
});

it("reports the error and stays put when archiving is denied (no silent no-op)", async () => {
  archiveMock.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
  render(<ReaderTopBar threadId="t1" canManage />);
  screen.getByRole("button", { name: "Archive" }).click();
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(push).not.toHaveBeenCalled();
});

it("shows the N / total position and navigates to prev/next carrying the folder", () => {
  neighborsData = { prevId: "t0", nextId: "t2", index: 2, total: 3 };
  searchParamsStr = "folder=sent";
  render(<ReaderTopBar threadId="t1" canManage />);
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
  screen.getByRole("button", { name: /previous/i }).click();
  expect(push).toHaveBeenCalledWith("/inbox/t0?folder=sent");
  screen.getByRole("button", { name: /next/i }).click();
  expect(push).toHaveBeenCalledWith("/inbox/t2?folder=sent");
});

it("disables prev at the newest thread and next at the oldest", () => {
  neighborsData = { prevId: null, nextId: "t2", index: 1, total: 3 };
  render(<ReaderTopBar threadId="t1" canManage />);
  expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
});

it("renders no position nav for a non-owner (neighbors null)", () => {
  neighborsData = null;
  render(<ReaderTopBar threadId="t1" canManage />);
  expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
});

it("deletes to Gmail Trash after confirming, then returns to the inbox", async () => {
  render(<ReaderTopBar threadId="t1" canManage />);
  screen.getByRole("button", { name: "Delete" }).click();
  // Confirm in the AlertDialog (role=alertdialog, its Action button).
  const confirm = await screen.findByRole("button", { name: /move to trash/i });
  confirm.click();
  await waitFor(() => expect(trashMock).toHaveBeenCalledWith("csrf", { threadId: "t1" }));
  // REPLACE (not push) so the deleted reader route is not left in history; caches invalidated
  // (feeds + the reader's thread.get) so Back re-fetches instead of showing the trashed thread.
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/inbox"));
  expect(push).not.toHaveBeenCalled();
  expect(invalidateAll).toHaveBeenCalled();
});

it("surfaces a failed delete and stays put (no silent no-op)", async () => {
  trashMock.mockResolvedValueOnce({ ok: false, error: { id: "E_GMAIL_001" } } as never);
  render(<ReaderTopBar threadId="t1" canManage />);
  screen.getByRole("button", { name: "Delete" }).click();
  (await screen.findByRole("button", { name: /move to trash/i })).click();
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_GMAIL_001"));
  expect(push).not.toHaveBeenCalled();
});

it("groups Archive and Delete together on the left, not pushed to the far right (B3)", () => {
  render(<ReaderTopBar threadId="t1" canManage />);
  const archive = screen.getByRole("button", { name: "Archive" });
  const del = screen.getByRole("button", { name: "Delete" });
  // PD groups the reader actions top-left; WD previously pushed Archive right with ml-auto.
  expect(archive.className).not.toMatch(/ml-auto/);
  // Archive + Delete share one action group wrapper (grouped per PD), distinct from the Back link.
  const group = archive.closest("[data-reader-actions-group]");
  expect(group).not.toBeNull();
  expect(del.closest("[data-reader-actions-group]")).toBe(group);
  expect(
    screen.getByRole("link", { name: /back/i }).closest("[data-reader-actions-group]"),
  ).toBeNull();
});

it("hides Archive and Delete for a non-owner (canManage false)", () => {
  render(<ReaderTopBar threadId="t1" canManage={false} />);
  expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
});
