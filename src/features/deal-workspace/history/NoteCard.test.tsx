// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NoteCard } from "./NoteCard";

const togglePin = vi.fn<(...args: unknown[]) => Promise<{ ok: true; value: { id: string } }>>(() =>
  Promise.resolve({ ok: true, value: { id: "n1" } }),
);
const updateNote = vi.fn<(...args: unknown[]) => Promise<{ ok: true; value: { id: string } }>>(() =>
  Promise.resolve({ ok: true, value: { id: "n1" } }),
);
const deleteNote = vi.fn<(...args: unknown[]) => Promise<{ ok: true; value: { id: string } }>>(() =>
  Promise.resolve({ ok: true, value: { id: "n1" } }),
);

vi.mock("@/features/collaboration/actions", () => ({
  togglePinAction: (...a: unknown[]) => togglePin(...a),
  updateNoteAction: (...a: unknown[]) => updateNote(...a),
  deleteNoteAction: (...a: unknown[]) => deleteNote(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

afterEach(() => {
  cleanup();
  reportError.mockClear();
});

const base = {
  id: "n1",
  body: "Called the buyer",
  at: new Date("2026-07-02T10:00:00Z"),
  actorName: "Nick",
  pinned: false,
};

it("renders the note body and an inline pin control", () => {
  render(<NoteCard {...base} />);
  expect(screen.getByText("Called the buyer")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /pin/i })).toBeInTheDocument();
});

it("pins in one click", async () => {
  const user = userEvent.setup();
  render(<NoteCard {...base} onChanged={() => {}} />);
  await user.click(screen.getByRole("button", { name: /pin/i }));
  expect(togglePin).toHaveBeenCalledWith({ noteId: "n1", pinned: true }, "csrf");
});

it("edits the body via the menu", async () => {
  const user = userEvent.setup();
  render(<NoteCard {...base} onChanged={() => {}} />);
  await user.click(screen.getByRole("button", { name: /more actions/i }));
  await user.click(screen.getByRole("menuitem", { name: /edit/i }));
  const box = screen.getByRole("textbox", { name: /note/i });
  await user.clear(box);
  await user.type(box, "Edited");
  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(updateNote).toHaveBeenCalledWith({ noteId: "n1", body: "Edited" }, "csrf");
});

it("deletes after confirming", async () => {
  const user = userEvent.setup();
  render(<NoteCard {...base} onChanged={() => {}} />);
  await user.click(screen.getByRole("button", { name: /more actions/i }));
  await user.click(screen.getByRole("menuitem", { name: /delete/i }));
  // Confirm dialog: the destructive confirm button, not the menu item.
  await user.click(screen.getByRole("button", { name: /^delete$/i }));
  expect(deleteNote).toHaveBeenCalledWith({ noteId: "n1" }, "csrf");
});

it("surfaces the error and keeps editing open when saving an edit is denied", async () => {
  updateNote.mockResolvedValueOnce({ ok: false as const, error: { id: "E_PERM_001" } } as never);
  const onChanged = vi.fn();
  const user = userEvent.setup();
  render(<NoteCard {...base} onChanged={onChanged} />);
  await user.click(screen.getByRole("button", { name: /more actions/i }));
  await user.click(screen.getByRole("menuitem", { name: /edit/i }));
  await user.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(onChanged).not.toHaveBeenCalled();
  // The editor stays open so the edit is not silently lost.
  expect(screen.getByRole("textbox", { name: /note/i })).toBeInTheDocument();
});

it("surfaces the error when deleting is denied (no silent swallow)", async () => {
  deleteNote.mockResolvedValueOnce({ ok: false as const, error: { id: "E_PERM_001" } } as never);
  const onChanged = vi.fn();
  const user = userEvent.setup();
  render(<NoteCard {...base} onChanged={onChanged} />);
  await user.click(screen.getByRole("button", { name: /more actions/i }));
  await user.click(screen.getByRole("menuitem", { name: /delete/i }));
  await user.click(screen.getByRole("button", { name: /^delete$/i }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(onChanged).not.toHaveBeenCalled();
});

it("rolls back the pin and surfaces the error when pinning is denied", async () => {
  togglePin.mockResolvedValueOnce({ ok: false as const, error: { id: "E_PERM_001" } } as never);
  const user = userEvent.setup();
  render(<NoteCard {...base} onChanged={() => {}} />);
  const pinBtn = screen.getByRole("button", { name: /pin note/i });
  await user.click(pinBtn);
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  // Optimistic pin was rolled back to the unpinned state.
  expect(screen.getByRole("button", { name: /pin note/i })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
