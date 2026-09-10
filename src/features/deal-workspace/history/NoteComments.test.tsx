// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NoteComments } from "./NoteComments";

type CommentRow = {
  id: string;
  noteId: string;
  body: string;
  authorId: string;
  actorName: string | null;
  canModify: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let rows: CommentRow[] = [];
const invalidate = vi.fn(() => Promise.resolve());

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    collaboration: { listComments: { useQuery: () => ({ data: rows }) } },
    useUtils: () => ({ collaboration: { listComments: { invalidate } } }),
  },
}));

const createComment = vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ ok: true as const, value: { id: "c9" } }),
);
const updateComment = vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ ok: true as const, value: { id: "c1" } }),
);
const deleteComment = vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ ok: true as const, value: { id: "c1" } }),
);

vi.mock("@/features/collaboration/commentActions", () => ({
  createCommentAction: (...a: unknown[]) => createComment(...a),
  updateCommentAction: (...a: unknown[]) => updateComment(...a),
  deleteCommentAction: (...a: unknown[]) => deleteComment(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

function commentRow(over: Partial<CommentRow> = {}): CommentRow {
  return {
    id: "c1",
    noteId: "n1",
    body: "Good catch, I will follow up",
    authorId: "u2",
    actorName: "Grace Hopper",
    canModify: false,
    createdAt: new Date("2026-07-02T11:00:00Z"),
    updatedAt: new Date("2026-07-02T11:00:00Z"),
    ...over,
  };
}

const scope = { noteId: "n1", entityType: "deal" as const, entityId: "d1" };

afterEach(() => {
  cleanup();
  rows = [];
  createComment.mockClear();
  updateComment.mockClear();
  deleteComment.mockClear();
  invalidate.mockClear();
});

it("lists only the comments belonging to this note", () => {
  rows = [commentRow(), commentRow({ id: "c2", noteId: "other", body: "not mine" })];
  render(<NoteComments {...scope} />);
  expect(screen.getByText("Good catch, I will follow up")).toBeInTheDocument();
  expect(screen.queryByText("not mine")).not.toBeInTheDocument();
  expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
});

it("posts a new comment through the composer and refetches", async () => {
  render(<NoteComments {...scope} />);
  await userEvent.click(screen.getByRole("button", { name: "Comment" }));
  await userEvent.type(screen.getByLabelText("Comment"), "on it");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(createComment).toHaveBeenCalledWith({ noteId: "n1", body: "on it" }, "csrf");
  });
  expect(invalidate).toHaveBeenCalled();
});

it("offers no edit or delete menu on a comment the actor cannot modify", () => {
  rows = [commentRow({ canModify: false })];
  render(<NoteComments {...scope} />);
  expect(screen.queryByRole("button", { name: "Comment actions" })).not.toBeInTheDocument();
});

it("edits a comment the actor owns", async () => {
  rows = [commentRow({ canModify: true })];
  render(<NoteComments {...scope} />);
  await userEvent.click(screen.getByRole("button", { name: "Comment actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  const box = screen.getByLabelText("Comment");
  await userEvent.clear(box);
  await userEvent.type(box, "revised");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(updateComment).toHaveBeenCalledWith({ commentId: "c1", body: "revised" }, "csrf");
  });
});

it("deletes a comment the actor owns after confirming", async () => {
  rows = [commentRow({ canModify: true })];
  render(<NoteComments {...scope} />);
  await userEvent.click(screen.getByRole("button", { name: "Comment actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete comment" }));

  await waitFor(() => {
    expect(deleteComment).toHaveBeenCalledWith({ commentId: "c1" }, "csrf");
  });
});

it("edits from the latest body after somebody else revised the comment", async () => {
  rows = [commentRow({ canModify: true })];
  const view = render(<NoteComments {...scope} />);

  rows = [commentRow({ canModify: true, body: "Revised by an admin" })];
  view.rerender(<NoteComments {...scope} />);

  await userEvent.click(screen.getByRole("button", { name: "Comment actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(screen.getByLabelText("Comment")).toHaveValue("Revised by an admin");
});
